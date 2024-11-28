import type {
  Transaction,
  InjectedWallet,
  WalletModuleFactory,
  WalletBehaviourFactory,
} from '@near-wallet-selector/core';
import { providers, transactions } from 'near-api-js';
import type { AccessKeyViewRaw } from 'near-api-js/lib/providers/provider';
import { actionCreators } from '@near-js/transactions';

import { PublicKey } from 'near-api-js/lib/utils/key_pair';
import { encodeTransaction } from 'near-api-js/lib/transaction';
import { baseDecode } from '@near-js/utils';
import bs58 from 'bs58';
import { sha256 } from 'js-sha256';
import { setupWalletButton, removeWalletButton } from '../utils/initWalletButton';
import type { useBtcWalletSelector } from './btcWalletSelectorContext';
import { delay, retryOperation } from '../utils';
import { walletConfig, nearRpcUrls } from '../config';
import request from '../utils/request';
const { transfer, functionCall } = actionCreators;

declare global {
  interface Window {
    btcContext: ReturnType<typeof useBtcWalletSelector>;
  }
}

interface BTCWalletParams {
  iconUrl?: string;
  deprecated?: boolean;
  autoConnect?: boolean;
  syncLogOut?: boolean;
  isDev?: boolean;
}

const state: any = {
  saveAccount(account: string) {
    window.localStorage.setItem('btc-wallet-account', account);
  },
  removeAccount() {
    window.localStorage.removeItem('btc-wallet-account');
  },
  savePublicKey(publicKey: string) {
    window.localStorage.setItem('btc-wallet-publickey', publicKey);
  },
  removePublicKey() {
    window.localStorage.removeItem('btc-wallet-publickey');
  },
  saveBtcPublicKey(publicKey: string) {
    window.localStorage.setItem('btc-wallet-btc-publickey', publicKey);
  },
  removeBtcPublicKey() {
    window.localStorage.removeItem('btc-wallet-btc-publickey');
  },
  clear() {
    this.removeAccount();
    this.removePublicKey();
    this.removeBtcPublicKey();
  },
  save(account: string, publicKey: string) {
    this.saveAccount(account);
    this.savePublicKey(publicKey);
  },
  getAccount() {
    return window.localStorage.getItem('btc-wallet-account');
  },
  getPublicKey() {
    return window.localStorage.getItem('btc-wallet-publickey');
  },
  getBtcPublicKey() {
    return window.localStorage.getItem('btc-wallet-btc-publickey');
  },
};

let inter: any = null;

const BTCWallet: WalletBehaviourFactory<InjectedWallet> = async ({
  metadata,
  options,
  store,
  emitter,
  logger,
  id,
  provider,
}) => {
  const wallet = {
    signIn,
    signOut,
    getAccounts,
    verifyOwner,
    signMessage,
    signAndSendTransaction,
    signAndSendTransactions,
  };

  const currentConfig =
    'isDev' in metadata && metadata.isDev
      ? walletConfig.dev
      : walletConfig[options.network.networkId];
  const walletNetwork = 'isDev' in metadata && metadata.isDev ? 'dev' : options.network.networkId;

  initWalletButton(walletNetwork, wallet);

  if (!inter) {
    inter = setInterval(async () => {
      // @ts-ignore
      const btcContext = window.btcContext;

      if (btcContext) {
        clearInterval(inter);
        const context = btcContext.getContext();

        context.on('updatePublicKey', async (btcPublicKey: string) => {
          const { nearTempAddress } = await getNearAccountByBtcPublicKey(btcPublicKey);

          removeWalletButton();
          initWalletButton(walletNetwork, wallet);

          emitter.emit('accountsChanged', {
            accounts: [
              {
                accountId: nearTempAddress,
                // active: true
              },
            ],
          });
        });

        context.on('btcLoginError', async (e: any) => {
          emitter.emit('accountsChanged', {
            accounts: [],
          });
        });

        context.on('btcLogOut', async (e: any) => {
          emitter.emit('accountsChanged', {
            accounts: [],
          });
        });

        if (
          'autoConnect' in metadata &&
          metadata.autoConnect &&
          localStorage.getItem('near-wallet-selector:selectedWalletId') === '"btc-wallet"'
        ) {
          await btcContext.autoConnect();
        }

        clearInterval(inter);
      }
    }, 500);
  }

  async function viewMethod({ method, args = {} }: { method: string; args: any }) {
    const res = await provider.query<any>({
      request_type: 'call_function',
      account_id: currentConfig.contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'optimistic',
    });
    return JSON.parse(Buffer.from(res.result).toString());
  }

  async function getNearAccountByBtcPublicKey(btcPublicKey: string) {
    const nearTempAddress = await viewMethod({
      method: 'get_chain_signature_near_account',
      args: { btc_public_key: btcPublicKey },
    });

    const nearTempPublicKey = await viewMethod({
      method: 'get_chain_signature_near_account_public_key',
      args: { btc_public_key: btcPublicKey },
    });

    state.saveAccount(nearTempAddress);
    state.savePublicKey(nearTempPublicKey);
    state.saveBtcPublicKey(btcPublicKey);

    return {
      nearTempAddress,
      nearTempPublicKey,
    };
  }

  async function signIn({ contractId, methodNames }: any) {
    const accountId = state.getAccount();
    const publicKey = state.getPublicKey();

    const btcContext = window.btcContext;

    initWalletButton(walletNetwork, wallet);

    if (accountId && publicKey) {
      return [
        {
          accountId,
          publicKey,
        },
      ];
    }
    await btcContext.login();
    const btcPublicKey = await retryOperation(btcContext.getPublicKey, (res) => !!res, {
      maxRetries: 40,
      delayMs: 3000,
    });

    console.log('btcPublicKey:', btcPublicKey);
    if (!btcPublicKey) {
      throw new Error('No connected BTC wallet, please connect your BTC wallet first.');
    }

    const { nearTempAddress, nearTempPublicKey } = await getNearAccountByBtcPublicKey(btcPublicKey);

    return [
      {
        accountId: nearTempAddress,
        publicKey: nearTempPublicKey,
      },
    ];
  }

  async function signOut() {
    const accountId = state.getAccount();
    const publicKey = state.getPublicKey();
    if (!(accountId && publicKey)) {
      return;
    }
    const btcContext = window.btcContext;
    // @ts-ignore
    if (metadata.syncLogOut) {
      btcContext.logout();
    }

    state.clear();
    window.localStorage.removeItem('near-wallet-selector:selectedWalletId');
    removeWalletButton();
    // clearInterval(inter)
  }

  async function getAccounts() {
    return [{ accountId: state.getAccount() }];
  }

  async function verifyOwner() {
    throw new Error(`Method not supported by ${metadata.name}`);
  }

  async function signMessage() {
    throw new Error(`Method not supported by ${metadata.name}`);
  }

  async function signAndSendTransaction(params: Transaction) {
    const transactions = [params];
    const result = await signAndSendTransactions({ transactions });
    if (Array.isArray(result)) {
      return result[0];
    } else {
      throw new Error(`Transaction failed: ${result}`);
    }
  }

  async function signAndSendTransactions(params: { transactions: Transaction[] }) {
    const btcContext = window.btcContext;
    const accountId = state.getAccount();
    const publicKey = state.getPublicKey();

    const { header } = await provider.block({ finality: 'final' });

    const rawAccessKey = await provider.query<AccessKeyViewRaw>({
      request_type: 'view_access_key',
      account_id: accountId,
      public_key: publicKey,
      finality: 'final',
    });

    const accessKey = {
      ...rawAccessKey,
      nonce: BigInt(rawAccessKey.nonce || 0),
    };

    const publicKeyFormat = PublicKey.from(publicKey);

    const nearNonceApi = await getNearNonceFromApi(currentConfig.base_url, accountId);

    const newTransactions = params.transactions.map((transaction, index) => {
      let nearNonceNumber = accessKey.nonce + BigInt(1);
      if (nearNonceApi) {
        nearNonceNumber =
          BigInt(nearNonceApi.result_data) > nearNonceNumber
            ? BigInt(nearNonceApi.result_data)
            : nearNonceNumber;
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
      const txHex = Array.from(txBytes, (byte) =>
        ('0' + (byte & 0xff).toString(16)).slice(-2),
      ).join('');
      console.log('txHex:', txHex);

      const hash = bs58.encode(new Uint8Array(sha256.array(txBytes)));
      return { txBytes, txHex, hash };
    });

    const accountInfo = await viewMethod({
      method: 'get_account',
      args: { account_id: accountId },
    });

    const nonceApi = await getNonceFromApi(currentConfig.base_url, accountId as string);

    const nonce =
      Number(nonceApi?.result_data) > Number(accountInfo.nonce)
        ? String(nonceApi?.result_data)
        : String(accountInfo.nonce);

    const intention = {
      chain_id: '397',
      csna: accountId,
      near_transactions: newTransactions.map((t) => t.txHex),
      gas_token: currentConfig.token,
      gas_limit: '3000',
      // use_near_pay_gas: false,
      nonce,
    };

    // const nearAccount = await provider.query<any>({
    //   request_type: 'view_account',
    //   account_id: accountId,
    //   finality: 'final',
    // });
    // const availableBalance = parseFloat(nearAccount.amount) / 10 ** 24;
    // if (availableBalance > 0.2) {
    //   intention.use_near_pay_gas = true;
    // }

    const strIntention = JSON.stringify(intention);

    const signature = await btcContext.signMessage(strIntention);

    const result = await uploadBTCTx(currentConfig.base_url, {
      sig: signature,
      btcPubKey: state.getBtcPublicKey(),
      data: toHex(strIntention),
    });

    if (result.result_code === 0) {
      const hash = newTransactions.map((t) => t.hash);
      console.log('txHash:', hash);
      const result = await pollTransactionStatuses(options.network.networkId, hash);
      return result;
    } else {
      return null;
    }
  }

  async function initWalletButton(network: string, wallet: any) {
    const checkAndSetupWalletButton = () => {
      const accountId = state.getAccount();
      const btcContext = window.btcContext;

      if (accountId && btcContext.account) {
        setupWalletButton(network, wallet, btcContext);
      } else {
        removeWalletButton();
        setTimeout(() => {
          checkAndSetupWalletButton();
        }, 5000);
      }
    };
    await delay(1000);
    checkAndSetupWalletButton();
  }

  return wallet as any;
};

function getNonceFromApi(url: string, accountId: string) {
  return request<any>(`${url}/v1/nonce?csna=${accountId}`);
}

function getNearNonceFromApi(url: string, accountId: string) {
  return request<any>(`${url}/v1/nonceNear?csna=${accountId}`);
}

function uploadBTCTx(url: string, data: any) {
  return request<any>(`${url}/v1/receiveTransaction`, {
    method: 'POST',
    body: data,
  });
}

export function setupBTCWallet({
  iconUrl = 'https://assets.deltatrade.ai/assets/chain/btc.svg',
  deprecated = false,
  autoConnect = true,
  syncLogOut = true,
  isDev = false,
}: BTCWalletParams | undefined = {}): WalletModuleFactory<InjectedWallet> {
  const btcWallet = async () => {
    return {
      id: 'btc-wallet',
      type: 'injected',
      metadata: {
        name: 'BTC Wallet',
        description: 'BTC Wallet',
        iconUrl,
        downloadUrl: iconUrl,
        deprecated,
        available: true,
        autoConnect,
        syncLogOut,
        isDev,
      },
      init: BTCWallet,
    } as any;
  };

  return btcWallet;
}

function toHex(originalString: string) {
  const charArray = originalString.split('');
  const asciiArray = charArray.map((char) => char.charCodeAt(0));
  const hexArray = asciiArray.map((code) => code.toString(16));
  let hexString = hexArray.join('');
  hexString = hexString.replace(/(^0+)/g, '');
  return hexString;
}

async function pollTransactionStatuses(network: string, hashes: string[]) {
  const provider = new providers.FailoverRpcProvider(
    Object.values(nearRpcUrls[network as keyof typeof nearRpcUrls]).map(
      (url) => new providers.JsonRpcProvider({ url }),
    ),
  );

  const maxAttempts = 3;

  // Helper function to poll status for a single transaction hash
  const pollStatus = async (hash: string) => {
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        const result = await provider.txStatus(hash, 'unused', 'FINAL');

        if (result && result.status) {
          console.log(`Transaction ${hash} result:`, result);
          return result;
        }
      } catch (error: any) {
        console.error(`Failed to fetch transaction status for ${hash}: ${error.message}`);
      }

      if (attempt === maxAttempts) {
        throw new Error(`Transaction not found after max attempts: ${hash}`);
      }

      // Delay before next attempt
      await delay(10000);
      console.log(`RPC request failed for ${hash}, retrying ${maxAttempts - attempt} more times`);
    }
  };

  // Poll all transaction statuses in parallel
  const results = await Promise.all(hashes.map((hash) => pollStatus(hash)));

  return results;
}

export default {
  setupBTCWallet,
};
