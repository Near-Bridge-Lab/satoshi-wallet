import { toHex } from '.';
import request from './request';
import type { AccessKeyViewRaw } from 'near-api-js/lib/providers/provider';
import { actionCreators } from '@near-js/transactions';
import { PublicKey } from 'near-api-js/lib/utils/key_pair';
import { encodeTransaction } from 'near-api-js/lib/transaction';
import { baseDecode } from '@near-js/utils';
import bs58 from 'bs58';
import { sha256 } from 'js-sha256';
import type { Transaction } from '@near-wallet-selector/core';
import { getNearProvider, nearCallFunction } from './nearUtils';
import { getWalletConfig, type ENV } from '../config';
import { transactions } from 'near-api-js';
import Big from 'big.js';
import { Dialog } from './Dialog';
import state from '../core/setupBTCWallet/state';

interface RequestResult<T> {
  result_code: number;
  result_message: string;
  result_data: T;
}

export async function getNonce(url: string, accountId: string) {
  const { result_code, result_message, result_data } = await request<RequestResult<string>>(
    `${url}/v1/nonce?csna=${accountId}`,
  );
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function getNearNonce(url: string, accountId: string) {
  const { result_code, result_message, result_data } = await request<RequestResult<string>>(
    `${url}/v1/nonceNear?csna=${accountId}`,
  );
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function receiveTransaction(url: string, data: any) {
  const { result_code, result_message, result_data } = await request<RequestResult<any>>(
    `${url}/v1/receiveTransaction`,
    {
      method: 'POST',
      body: data,
    },
  );
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

interface ReceiveDepositMsgParams {
  btcPublicKey: string;
  txHash: string;
  depositType?: number;
  postActions?: string;
  extraMsg?: string;
}

export async function preReceiveDepositMsg(
  url: string,
  { btcPublicKey, depositType = 1, postActions, extraMsg }: Omit<ReceiveDepositMsgParams, 'txHash'>,
) {
  const { result_code, result_message, result_data } = await request<RequestResult<any>>(
    `${url}/v1/preReceiveDepositMsg`,
    {
      method: 'POST',
      body: { btcPublicKey, depositType, postActions, extraMsg },
    },
  );
  console.log('preReceiveDepositMsg resp:', { result_code, result_message, result_data });
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function receiveDepositMsg(
  url: string,
  { btcPublicKey, txHash, depositType = 1, postActions, extraMsg }: ReceiveDepositMsgParams,
) {
  const { result_code, result_message, result_data } = await request<RequestResult<any>>(
    `${url}/v1/receiveDepositMsg`,
    {
      method: 'POST',
      body: { btcPublicKey, txHash, depositType, postActions, extraMsg },
    },
  );
  console.log('receiveDepositMsg resp:', { result_code, result_message, result_data });
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function checkBridgeTransactionStatus(url: string, txHash: string) {
  const { result_code, result_message, result_data } = await request<
    RequestResult<{ Status: number; ToTxHash: string }>
  >(`${url}/v1/bridgeFromTx?fromTxHash=${txHash}&fromChainId=1`, {
    timeout: 300000,
    pollingInterval: 5000,
    maxPollingAttempts: 60,
    shouldStopPolling: (res) => {
      const status = res.result_data?.Status || 0;
      return res.result_code === 0 && (status === 4 || status >= 50);
    },
  });
  console.log('checkTransactionStatus resp:', { result_code, result_message, result_data });
  if (result_data?.Status !== 4) {
    throw new Error(result_message || `Transaction failed, status: ${result_data?.Status}`);
  }
  return result_data;
}

export async function checkBtcTransactionStatus(url: string, sig: string) {
  const { result_code, result_message, result_data } = await request<
    RequestResult<{ Status: number; NearHashList: string[] }>
  >(`${url}/v1/btcTx?sig=${toHex(sig)}`, {
    timeout: 300000,
    pollingInterval: 5000,
    maxPollingAttempts: 60,
    shouldStopPolling: (res) => {
      const status = res.result_data?.Status || 0;
      return res.result_code === 0 && (status === 3 || status >= 10);
    },
  });
  console.log('checkBtcTransactionStatus resp:', { result_code, result_message, result_data });
  if (result_data?.Status !== 3) {
    throw new Error(result_message || `Transaction failed, status: ${result_data?.Status}`);
  }
  return result_data;
}

export async function getWhitelist(url: string) {
  const data = await request<string[]>(`${url}/v1/whitelist/users`).catch((error) => {
    console.error('getWhitelist error:', error);
    return [] as string[];
  });
  return data;
}

export async function receiveWithdrawMsg(url: string, txHash: string) {
  const { result_code, result_message, result_data } = await request<RequestResult<any>>(
    `${url}/v1/receiveWithdrawMsg`,
    {
      method: 'POST',
      body: { txHash },
    },
  );
  console.log('receiveWithdrawMsg resp:', { result_code, result_message, result_data });
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

export interface AccountInfo {
  nonce: string;
  gas_token: Record<string, string>;
  debt_info?: {
    gas_token_id: string;
    near_gas_debt_amount: string;
    protocol_fee_debt_amount: string;
  };
  relayer_fee?: { amount?: string };
}

export async function getAccountInfo({ csna, env }: { csna: string; env: ENV }) {
  const config = getWalletConfig(env);
  const accountInfo = await nearCallFunction<AccountInfo>(
    config.accountContractId,
    'get_account',
    {
      account_id: csna,
    },
    { network: config.network },
  ).catch((error) => {
    return undefined;
  });
  console.log('get_account accountInfo:', accountInfo);
  return accountInfo;
}

export async function getTokenBalance({
  csna,
  tokenId,
  env,
}: {
  csna: string;
  tokenId: string;
  env: ENV;
}): Promise<{ balance: number; rawBalance: string }> {
  const config = getWalletConfig(env);
  const nearProvider = getNearProvider({ network: config.network });
  try {
    if (tokenId === config.nearToken) {
      const nearAccount = await nearProvider.query<any>({
        request_type: 'view_account',
        account_id: csna,
        finality: 'final',
      });
      const balance = parseFloat(nearAccount.amount) / 10 ** config.nearTokenDecimals;
      return { balance, rawBalance: nearAccount.amount };
    } else {
      const res = await nearCallFunction<string>(
        tokenId,
        'ft_balance_of',
        { account_id: csna },
        { network: config.network },
      );
      const decimals =
        tokenId === config.btcToken
          ? config.btcTokenDecimals
          : (
              await nearCallFunction<{ decimals: number }>(
                tokenId,
                'ft_metadata',
                {},
                { network: config.network },
              )
            ).decimals;
      const balance = parseFloat(res) / 10 ** decimals;
      return { balance, rawBalance: res };
    }
  } catch (error) {
    console.error('getTokenBalance error:', error);
    return { balance: 0, rawBalance: '0' };
  }
}

export async function checkGasTokenBalance(csna: string, minAmount: string, env: ENV) {
  const config = getWalletConfig(env);
  const { rawBalance } = await getTokenBalance({ csna, tokenId: config.btcToken, env });
  console.log('gas token balance:', rawBalance);
  if (new Big(rawBalance).lt(minAmount)) {
    await Dialog.confirm({
      title: 'Gas token balance is insufficient',
      message: 'Please deposit gas token to continue, will open bridge website.',
    });
    window.open(config.bridgeUrl, '_blank');
    throw new Error('Gas token balance is insufficient');
  }
}

const { functionCall, transfer } = actionCreators;
export async function convertTransactionToTxHex({
  transaction,
  accountId,
  publicKey,
  env,
  index = 0,
}: {
  transaction: Transaction;
  accountId: string;
  publicKey: string;
  env: ENV;
  index?: number;
}) {
  const publicKeyFormat = PublicKey.from(publicKey);
  const currentConfig = getWalletConfig(env);
  const provider = getNearProvider({ network: currentConfig.network });

  const { header } = await provider.block({
    finality: 'final',
  });

  const rawAccessKey = await provider
    .query<AccessKeyViewRaw>({
      request_type: 'view_access_key',
      account_id: accountId,
      public_key: publicKey,
      finality: 'final',
    })
    .catch((e) => {
      console.log('view_access_key error:', e);
      return undefined;
    });

  const accessKey = {
    ...rawAccessKey,
    nonce: BigInt(rawAccessKey?.nonce || 0),
  };

  const nearNonceFromApi = await getNearNonce(currentConfig.base_url, accountId);

  let nearNonceNumber = accessKey.nonce + BigInt(1);
  if (nearNonceFromApi) {
    nearNonceNumber =
      BigInt(nearNonceFromApi) > nearNonceNumber ? BigInt(nearNonceFromApi) : nearNonceNumber;
  }

  const newActions = transaction.actions
    .map((action) => {
      switch (action.type) {
        case 'FunctionCall':
          return functionCall(
            action.params.methodName,
            action.params.args,
            BigInt(action.params.gas),
            BigInt(action.params.deposit),
          );
        case 'Transfer':
          return transfer(BigInt(action.params.deposit));
      }
    })
    .filter(Boolean) as transactions.Action[];

  const _transaction = transactions.createTransaction(
    accountId,
    publicKeyFormat,
    transaction.receiverId,
    BigInt(nearNonceNumber) + BigInt(index),
    newActions,
    baseDecode(header.hash),
  );

  const txBytes = encodeTransaction(_transaction);
  const txHex = Array.from(txBytes, (byte) => ('0' + (byte & 0xff).toString(16)).slice(-2)).join(
    '',
  );
  const hash = bs58.encode(new Uint8Array(sha256.array(txBytes)));

  return { txBytes, txHex, hash };
}

interface CalculateGasLimitParams {
  transactions: Transaction[];
  csna: string;
  env: ENV;
}

export async function calculateGasLimit(params: CalculateGasLimitParams) {
  const trans = [...params.transactions];
  console.log('raw trans:', trans);

  const { gasLimit } = await calculateGasStrategy(params);

  return gasLimit;
}

export async function calculateGasStrategy({
  csna,
  transactions,
  env,
}: CalculateGasLimitParams): Promise<{
  transferGasTransaction?: Transaction;
  useNearPayGas: boolean;
  gasLimit: string;
}> {
  const currentConfig = getWalletConfig(env);

  const accountInfo = await getAccountInfo({ csna, env });
  const gasTokenBalance = accountInfo?.gas_token[currentConfig.btcToken] || '0';
  const { balance: nearBalance } = await getTokenBalance({
    csna,
    tokenId: currentConfig.nearToken,
    env,
  });

  const transferAmount = transactions.reduce(
    (acc, tx) => {
      // deposit near
      tx.actions.forEach((action: any) => {
        // deposit near
        if (action.params.deposit) {
          const amount = Number(action.params.deposit) / 10 ** currentConfig.nearTokenDecimals;
          console.log('near deposit amount:', amount);
          acc.near = acc.near.plus(amount);
        }
        //transfer btc
        if (
          tx.receiverId === currentConfig.btcToken &&
          ['ft_transfer_call', 'ft_transfer'].includes(action.params.methodName)
        ) {
          const amount = Number(action.params.args.amount) / 10 ** currentConfig.btcTokenDecimals;
          console.log('btc transfer amount:', amount);
          acc.btc = acc.btc.plus(amount);
        }
      });
      return acc;
    },
    { near: new Big(0), btc: new Big(0) },
  );

  const nearAvailableBalance = new Big(nearBalance).minus(transferAmount.near).toNumber();

  console.log('available near balance:', nearAvailableBalance);
  console.log('available gas token balance:', gasTokenBalance);

  const convertTx = await Promise.all(
    transactions.map((transaction, index) =>
      convertTransactionToTxHex({
        transaction,
        accountId: state.getAccount(),
        publicKey: state.getPublicKey(),
        index,
        env,
      }),
    ),
  );

  if (nearAvailableBalance > 0.5) {
    console.log('near balance is enough, get the protocol fee of each transaction');
    const gasTokens = await nearCallFunction<Record<string, { per_tx_protocol_fee: string }>>(
      currentConfig.accountContractId,
      'list_gas_token',
      { token_ids: [currentConfig.btcToken] },
      { network: currentConfig.network },
    );

    console.log('list_gas_token gas tokens:', gasTokens);

    const perTxFee = Math.max(
      Number(gasTokens[currentConfig.btcToken]?.per_tx_protocol_fee || 0),
      100,
    );
    console.log('perTxFee:', perTxFee);
    const protocolFee = new Big(perTxFee || '0').mul(convertTx.length).toFixed(0);
    console.log('protocolFee:', protocolFee);

    // if (new Big(gasTokenBalance).gte(protocolFee)) {
    //   console.log('use near pay gas and enough gas token balance');
    //   return { useNearPayGas: true, gasLimit: protocolFee };
    // } else {
    //   console.log('use near pay gas and not enough gas token balance');
    // gas token balance is not enough, need to transfer
    const transferTx = await createGasTokenTransfer({ csna, amount: protocolFee, env });
    return recalculateGasWithTransfer({
      csna,
      transferTx,
      transactions: convertTx,
      useNearPayGas: true,
      perTxFee: perTxFee.toString(),
      env,
    });
    // }
  } else {
    console.log('near balance is not enough, predict the gas token amount required');
    const adjustedGas = await getPredictedGasAmount({
      accountContractId: currentConfig.accountContractId,
      tokenId: currentConfig.btcToken,
      transactions: convertTx.map((t) => t.txHex),
      env,
    });

    // if (new Big(gasTokenBalance).gte(adjustedGas)) {
    //   console.log('use gas token and gas token balance is enough');
    //   return { useNearPayGas: false, gasLimit: adjustedGas };
    // } else {
    //   console.log('use gas token and gas token balance is not enough, need to transfer');
    const transferTx = await createGasTokenTransfer({ csna, amount: adjustedGas, env });
    return recalculateGasWithTransfer({
      csna,
      transferTx,
      transactions: convertTx,
      useNearPayGas: false,
      env,
    });
    // }
  }
}

async function createGasTokenTransfer({
  csna,
  amount,
  env,
}: {
  csna: string;
  amount: string;
  env: ENV;
}) {
  const currentConfig = getWalletConfig(env);
  return {
    signerId: csna,
    receiverId: currentConfig.btcToken,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'ft_transfer_call',
          args: {
            receiver_id: currentConfig.accountContractId,
            amount,
            msg: JSON.stringify('Repay'),
          },
          gas: new Big(50).mul(10 ** 12).toFixed(0),
          deposit: '1',
        },
      },
    ],
  } as Transaction;
}

async function recalculateGasWithTransfer({
  csna,
  transferTx,
  transactions,
  useNearPayGas,
  perTxFee,
  env,
}: {
  csna: string;
  transferTx: Transaction;
  transactions: { txHex: string }[];
  useNearPayGas: boolean;
  perTxFee?: string;
  env: ENV;
}) {
  const currentConfig = getWalletConfig(env);
  const { txHex: transferTxHex } = await convertTransactionToTxHex({
    transaction: transferTx,
    accountId: state.getAccount(),
    publicKey: state.getPublicKey(),
    index: 0,
    env,
  });

  let newGasLimit;
  if (useNearPayGas && perTxFee) {
    newGasLimit = new Big(perTxFee).mul(transactions.length + 1).toFixed(0);
  } else {
    newGasLimit = await getPredictedGasAmount({
      accountContractId: currentConfig.accountContractId,
      tokenId: currentConfig.btcToken,
      transactions: [transferTxHex, ...transactions.map((t) => t.txHex)],
      env,
    });
  }

  (transferTx.actions[0] as any).params.args.amount = newGasLimit;

  return { transferGasTransaction: transferTx, useNearPayGas, gasLimit: newGasLimit };
}

async function getPredictedGasAmount({
  accountContractId,
  tokenId,
  transactions,
  env,
}: {
  accountContractId: string;
  tokenId: string;
  transactions: string[];
  env: ENV;
}): Promise<string> {
  const currentConfig = getWalletConfig(env);
  const predictedGas = await nearCallFunction<string>(
    accountContractId,
    'predict_txs_gas_token_amount',
    {
      gas_token_id: tokenId,
      near_transactions: transactions,
    },
    { network: currentConfig.network },
  );

  const predictedGasAmount = new Big(predictedGas).mul(1.2).toFixed(0);
  const miniGasAmount = 200 * transactions.length;
  const gasAmount = Math.max(Number(predictedGasAmount), miniGasAmount);
  console.log('predictedGas:', predictedGasAmount);
  return gasAmount.toString();
}
