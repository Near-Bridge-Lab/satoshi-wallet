import { BTC_TOKEN_CONTRACT, NEAR_TOKEN_CONTRACT } from '@/config';
import { useTokenStore } from '@/stores/token';
import { useWalletStore } from '@/stores/wallet';
import { formatAmount, formatFileUrl, parseAmount } from '@/utils/format';
import { Transaction } from '@near-wallet-selector/core';
import Big from 'big.js';
import { connect, keyStores, Near, providers } from 'near-api-js';
import { FinalExecutionOutcome, QueryResponseKind } from 'near-api-js/lib/providers/provider';
import { toast } from 'react-toastify';
import { rpcManager } from './rpcManager';
import { ThrottledJsonRpcProvider } from './rpcProvider';

type CallFunctionParams = {
  contractId: string;
  method: string;
  args?: any;
  network?: NetworkId;
};

export const nearServices = {
  getNearConnectionConfig(network = process.env.NEXT_PUBLIC_NETWORK) {
    const nodeUrl = rpcManager.getFastestNode();
    const sortedNodes = rpcManager.getSortedNodes();
    const jsonRpcProvider = sortedNodes.map((url) => new ThrottledJsonRpcProvider({ url }));
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
  /** Calls a view method and throws when the RPC request fails. */
  async callFunction<T = any>({ contractId, method, args = {}, network }: CallFunctionParams) {
    const { connection } = await this.nearConnect(network);
    const res = await connection.provider.query({
      request_type: 'call_function',
      account_id: contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'final',
    });
    return JSON.parse(
      Buffer.from((res as QueryResponseKind & { result: number[] }).result).toString(),
    ) as T;
  },
  /** Calls a view method and resolves to `undefined` when the call fails. */
  async query<T = any>(params: CallFunctionParams) {
    try {
      if (typeof window === 'undefined') return;
      return await this.callFunction<T>(params);
    } catch (error) {
      console.error(`${params.method} error`, error);
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
  /** Gets the balance of a token ('near' for the native one). Throws when an RPC request fails. */
  async getBalance(address: string) {
    const { accountId } = useWalletStore.getState();
    if (!address || !accountId) return '0';

    let balance: string;
    if (address === 'near') {
      const near = await this.nearConnect();
      const account = await near.account(accountId);
      balance = (await account.getAccountBalance()).available;
    } else {
      balance =
        (await this.callFunction<string>({
          contractId: address,
          method: 'ft_balance_of',
          args: { account_id: accountId },
        })) || '0';
    }
    const decimals =
      useTokenStore.getState().tokenMeta[address]?.decimals ??
      (await this.queryTokenMetadata(address))?.decimals;
    return formatAmount(balance, decimals);
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
