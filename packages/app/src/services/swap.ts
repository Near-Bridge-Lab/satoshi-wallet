import { generateUrl, safeJSONParse, sleep } from '@/utils/common';
import request, { rpcToWallet } from '@/utils/request';
import { type FunctionCallAction, type Transaction } from '@near-wallet-selector/core';
import { nearServices } from './near';
import { formatAmount, parseAmount } from '@/utils/format';
import { NEAR_TOKEN_CONTRACT } from '@/config';
import { useTokenStore } from '@/stores/token';
import Big from 'big.js';

interface QuerySwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  pathDeep?: number;
  slippage?: number;
  routerCount?: number;
}

interface NearQuerySwapResponse {
  routes: {
    pools: {
      pool_id: string;
      token_in: string;
      token_out: string;
      amount_in: string;
      amount_out: string;
      min_amount_out: string;
    }[];
    amount_in: string;
    min_amount_out: string;
    amount_out: string;
  }[];
  contract_in: string;
  contract_out: string;
  amount_in: string;
  amount_out: string;
}

export const nearSwapServices = {
  async query({
    tokenIn,
    tokenOut,
    amountIn,
    pathDeep = 3,
    slippage = 0.005,
    routerCount,
  }: QuerySwapParams) {
    if (new Big(amountIn).eq(0)) return { amountIn: 0, amountOut: 0, minAmountOut: 0 };
    const { tokenMeta } = useTokenStore.getState();
    const tokenInDecimals = tokenMeta[tokenIn]?.decimals;
    const tokenOutDecimals = tokenMeta[tokenOut]?.decimals;
    const parsedAmountIn = parseAmount(amountIn, tokenInDecimals);
    const { result_data } = await request<{ result_data: NearQuerySwapResponse }>(
      generateUrl(`${process.env.NEXT_PUBLIC_NEAR_SWAP_API}/findPath`, {
        tokenIn,
        tokenOut,
        amountIn: parsedAmountIn,
        pathDeep,
        slippage,
        routerCount,
      }),
      { cacheTimeout: 3000 },
    );
    const amountOut = formatAmount(result_data.amount_out || 0, tokenOutDecimals);
    const minAmountOut = new Big(amountOut).times(1 - slippage).toString();
    return {
      ...result_data,
      amountIn,
      amountOut,
      minAmountOut,
    };
  },
  async queryPriceImpact({
    tokenIn,
    tokenOut,
    amountIn,
    pathDeep = 3,
    slippage = 0.001,
    routerCount,
  }: QuerySwapParams) {
    if (new Big(amountIn).eq(0)) return 0;
    const newRes = await this.query({
      tokenIn,
      tokenOut,
      amountIn,
      pathDeep,
      slippage,
      routerCount,
    });
    const { tokenMeta, prices } = useTokenStore.getState();
    const tokenInPrice = prices[tokenMeta[tokenIn]?.symbol!] || 0;
    // calculate new price (tokenIn/tokenOut)
    const newPrice = new Big(amountIn).div(new Big(newRes.amountOut).eq(0) ? 1 : newRes.amountOut);
    const minimumAmountIn = new Big(1)
      .div(new Big(tokenInPrice).eq(0) ? 1 : tokenInPrice)
      .toString();
    const oldRes = await this.query({
      tokenIn,
      tokenOut,
      amountIn: minimumAmountIn,
      pathDeep,
      slippage,
      routerCount,
    });
    // get current market price (tokenOut/tokenIn)
    const oldPrice = new Big(minimumAmountIn).div(
      new Big(oldRes.amountOut).eq(0) ? 1 : oldRes.amountOut,
    );
    // Price Impact = (newPrice - oldPrice) / newPrice * 100
    const impact = newPrice.minus(oldPrice).div(newPrice).times(100).round(2).abs().toNumber();
    console.log(`impact:${impact}=(${newPrice}-${oldPrice})/${newPrice}*100`);
    return impact || 0;
  },

  async generateTransaction({
    tokenIn,
    tokenOut,
    amountIn,
    pathDeep = 3,
    slippage = 0.005,
    routerCount,
  }: QuerySwapParams) {
    const { tokenMeta } = useTokenStore.getState();
    const tokenInDecimals = tokenMeta[tokenIn]?.decimals;
    const parsedAmountIn = parseAmount(amountIn, tokenInDecimals);
    const {
      result_data: { methodName, args, gas },
    } = await request<{ result_data: FunctionCallAction['params'] }>(
      generateUrl(`${process.env.NEXT_PUBLIC_NEAR_SWAP_API}/swapPath`, {
        tokenIn,
        tokenOut,
        amountIn: parsedAmountIn,
        pathDeep,
        slippage,
      }),
    );
    const parsedMsg = safeJSONParse<any>((args as any).msg);
    if (!parsedMsg?.actions.length) throw new Error('No swap path found');
    if (tokenOut === NEAR_TOKEN_CONTRACT) {
      parsedMsg.skip_unwrap_near = false;
    }
    const newArgs = { ...args, msg: JSON.stringify(parsedMsg) };
    return {
      methodName,
      gas,
      deposit: '1',
      args: { ...newArgs, receiver_id: process.env.NEXT_PUBLIC_NEAR_SWAP_CONTRACT },
    };
  },
  async swap(params: QuerySwapParams) {
    const accountId = nearServices.getNearAccountId();
    if (!accountId) throw new Error('Wallet not found');
    const transaction = await this.generateTransaction(params);
    const baseRegisterTransaction = await nearServices.registerToken(params.tokenIn);
    const quoteRegisterTransaction = await nearServices.registerToken(params.tokenOut);
    const transactions: Transaction[] = [
      {
        signerId: accountId,
        receiverId: params.tokenIn,
        actions: [
          {
            type: 'FunctionCall',
            params: transaction,
          },
        ],
      },
    ];
    if (params.tokenIn === NEAR_TOKEN_CONTRACT) {
      (transactions[0].actions[0] as FunctionCallAction).params.gas = parseAmount(200, 12);
      transactions[0].actions.unshift({
        type: 'FunctionCall',
        params: {
          methodName: 'near_deposit',
          args: {},
          deposit: parseAmount(params.amountIn, 24),
          gas: parseAmount(100, 12),
        },
      });
    }
    if (baseRegisterTransaction) {
      transactions.unshift(baseRegisterTransaction);
    }
    if (quoteRegisterTransaction) {
      transactions.unshift(quoteRegisterTransaction);
    }
    console.log('transactions', transactions);
    const res = await rpcToWallet('signAndSendTransactions', {
      transactions,
    });
    console.log('sendTransactions outcomes', res);
    const transformedRes = nearServices.handleTransactionResult(res);
    return transformedRes;
  },
};
