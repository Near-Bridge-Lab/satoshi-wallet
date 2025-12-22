import { BTC_TOKEN_CONTRACT, NEAR_RPC_NODES, NEAR_TOKEN_CONTRACT } from '@/config';
import { useTokenStore } from '@/stores/token';
import { useWalletStore } from '@/stores/wallet';
import { formatAmount, formatFileUrl, parseAmount } from '@/utils/format';
import { Transaction } from '@near-wallet-selector/core';
import Big from 'big.js';
import { connect, keyStores, Near, providers } from 'near-api-js';
import { FinalExecutionOutcome, QueryResponseKind } from 'near-api-js/lib/providers/provider';
import { toast } from 'react-toastify';
import { rpcManager } from './rpcManager';

export const nearServices = {
  getNearConnectionConfig(network = process.env.NEXT_PUBLIC_NETWORK) {
    const nodeUrl = rpcManager.getFastestNode();
    const sortedNodes = rpcManager.getSortedNodes();
    const jsonRpcProvider = sortedNodes.map((url) => new providers.JsonRpcProvider({ url }));
    const provider = new providers.FailoverRpcProvider(jsonRpcProvider);
    return network === 'testnet'
      ? {
          networkId: 'testnet',
          keyStore: new keyStores.BrowserLocalStorageKeyStore(),
          nodeUrl,
          provider,
          walletUrl: 'https://testnet.mynearwallet.com',
          helperUrl: 'https://helper.testnet.near.org',
          explorerUrl: 'https://explorer.testnet.near.org',
          indexerUrl: 'https://testnet-api.kitwallet.app',
        }
      : {
          networkId: 'mainnet',
          keyStore: new keyStores.BrowserLocalStorageKeyStore(),
          nodeUrl,
          provider,
          walletUrl: 'https://app.mynearwallet.com',
          helperUrl: 'https://helper.mainnet.near.org',
          explorerUrl: 'https://explorer.mainnet.near.org',
          indexerUrl: 'https://api.kitwallet.app',
        };
  },
  near: {} as Record<NetworkId, Near>,
  clearNearCache() {
    this.near = {} as Record<NetworkId, Near>;
    console.log('Near connection cache cleared');
  },
  async nearConnect(network = process.env.NEXT_PUBLIC_NETWORK) {
    if (this.near[network]) return this.near[network];
    const near = await connect(this.getNearConnectionConfig(network));
    this.near[network] = near;
    return near;
  },
  async query<T = any>({
    contractId,
    method,
    args = {},
    network,
  }: {
    contractId: string;
    method: string;
    args?: any;
    gas?: string;
    deposit?: string;
    network?: NetworkId;
  }) {
    try {
      if (typeof window === 'undefined') return;
      const { connection } = await this.nearConnect(network);
      // console.log(`${method} args`, args);
      const res = await connection.provider.query({
        request_type: 'call_function',
        account_id: contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
        finality: 'final',
      });
      const result = JSON.parse(
        Buffer.from((res as QueryResponseKind & { result: number[] }).result).toString(),
      ) as T;
      // console.log(`${method} ${contractId} result`, result);
      return result;
    } catch (error) {
      console.error(`${method} error`, error);
    }
  },
  async queryTokenMetadata<T extends string | string[]>(token: T) {
    if (!token?.length) return;
    const tokenArr = Array.isArray(token) ? token : [token];
    const { tokenMeta: cachedTokenMeta } = useTokenStore.getState();

    const cachedTokens: Record<string, TokenMetadata> = {};
    const uncachedTokens: string[] = [];

    tokenArr.forEach((tokenAddress) => {
      if (tokenAddress === 'near') {
        cachedTokens[tokenAddress] = {
          symbol: 'NEAR',
          icon: formatFileUrl('/assets/crypto/near.svg'),
          decimals: 24,
        } as TokenMetadata;
      } else if (cachedTokenMeta[tokenAddress]) {
        cachedTokens[tokenAddress] = cachedTokenMeta[tokenAddress]!;
      } else {
        uncachedTokens.push(tokenAddress);
      }
    });

    let newTokenMeta: Record<string, TokenMetadata> = {};
    if (uncachedTokens.length > 0) {
      const res = await Promise.allSettled(
        uncachedTokens.map((token) =>
          this.query<TokenMetadata>({ contractId: token, method: 'ft_metadata' }),
        ),
      );

      newTokenMeta = res.reduce(
        (acc, token, index) => {
          if (token.status === 'fulfilled' && token.value) {
            const tokenMeta = token.value;
            if (tokenMeta.symbol === 'wNEAR') {
              tokenMeta.icon = formatFileUrl('/assets/crypto/wnear.png');
            }
            acc[uncachedTokens[index]] = tokenMeta;
          }
          return acc;
        },
        {} as Record<string, TokenMetadata>,
      );

      if (Object.keys(newTokenMeta).length > 0) {
        useTokenStore.getState().setTokenMeta(newTokenMeta);
      }
    }

    const allTokenMeta = { ...cachedTokens, ...newTokenMeta };

    if (typeof token === 'string') {
      return allTokenMeta[token] as T extends string ? TokenMetadata | undefined : never;
    }
    return (Object.keys(allTokenMeta).length ? allTokenMeta : undefined) as T extends string
      ? TokenMetadata | undefined
      : Record<string, TokenMetadata> | undefined;
  },

  getNearAccountId() {
    const accountId = useWalletStore.getState().accountId;
    return accountId;
  },
  /** get balance, if tokenAddress is undefined, get NEAR balance */
  async getBalance(address: string) {
    try {
      const { accountId } = useWalletStore.getState();
      const { tokenMeta } = useTokenStore.getState();
      if (!address || !accountId) return '0';
      const near = await this.nearConnect();
      const account = await near.account(accountId);
      let balance = '0';
      if (address === 'near') {
        balance = (await account.getAccountBalance()).available;
      } else {
        balance =
          (await this.query<string>({
            contractId: address,
            method: 'ft_balance_of',
            args: { account_id: accountId },
          })) || '0';
      }
      let decimals = tokenMeta[address]?.decimals;
      if (!decimals) {
        const res = await this.queryTokenMetadata(address);
        decimals = res?.decimals;
      }
      return formatAmount(balance, decimals);
    } catch (error) {
      console.error(error);
      return '0';
    }
  },
  getAvailableBalance(token: string, balance?: string) {
    if (!balance || !token) return '0';
    let availableBalance = balance;
    // if token is NBTC, need to reserve 800satoshi as gas fee
    if (token === BTC_TOKEN_CONTRACT) {
      availableBalance = new Big(balance).minus('0.000008').toFixed();
    }
    // if token is NEAR, need to reserve 0.5 NEAR as gas fee
    else if (token === 'near') {
      availableBalance = new Big(balance).minus('0.5').toFixed();
    }
    return new Big(availableBalance).gt(0) ? availableBalance : '0';
  },
  async registerToken(token: string, recipient?: string) {
    const _token = token === 'near' ? NEAR_TOKEN_CONTRACT : token;
    const accountId = useWalletStore.getState().accountId;
    const res = await this.query<{
      available: string;
      total: string;
    }>({
      contractId: _token,
      method: 'storage_balance_of',
      args: { account_id: recipient || accountId },
    });
    if (!res?.available) {
      return {
        receiverId: _token,
        actions: [
          {
            type: 'FunctionCall',
            params: {
              methodName: 'storage_deposit',
              args: {
                account_id: recipient || accountId,
                registration_only: true,
              },
              deposit: '1250000000000000000000',
              gas: parseAmount(100, 12),
            },
          },
        ],
      } as Transaction;
    }
  },
  handleTransactionResult<T extends FinalExecutionOutcome | FinalExecutionOutcome[]>(
    outcome: T,
  ): T | undefined {
    if (!outcome) return;
    if (Array.isArray(outcome)) {
      // @ts-expect-error fix
      const errorMessage = outcome.find((o) => o.status?.Failure?.ActionError)?.status.Failure
        .ActionError as string;
      if (errorMessage) {
        throw new Error(JSON.stringify(errorMessage));
      }
      return outcome;
    } else {
      // @ts-expect-error fix
      const errorMessage = outcome.status?.Failure?.ActionError as string;
      if (errorMessage) {
        toast.error(errorMessage);
        throw new Error(JSON.stringify(errorMessage));
      }
      if (typeof outcome === 'object') return outcome;
    }
  },
};

if (typeof window !== 'undefined') {
  rpcManager.onNodeChange(() => {
    nearServices.clearNearCache();
  });
}
