import type {
  Transaction,
  InjectedWallet,
  WalletModuleFactory,
  WalletBehaviourFactory,
} from '@near-wallet-selector/core';
import { setupWalletButton, removeWalletButton } from '../../utils/initWalletButton';
import type { useBtcWalletSelector } from '../btcWalletSelectorContext';
import { retryOperation, toHex } from '../../utils';
import type { ENV } from '../../config';
import { getWalletConfig } from '../../config';
import { nearCallFunction, pollTransactionStatuses } from '../../utils/nearUtils';

import { checkGasTokenDebt, getCsnaAccountId } from '../btcUtils';

import {
  getAccountInfo,
  checkBtcTransactionStatus,
  convertTransactionToTxHex,
  getNonce,
  receiveTransaction,
  checkGasTokenBalance,
  calculateGasStrategy,
} from '../../utils/satoshi';
import { getVersion } from '../../index';
import state from './state';
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
  env?: ENV;
}

const BTCWallet: WalletBehaviourFactory<InjectedWallet> = async ({
  metadata,
  options,
  store,
  emitter,
  logger,
  id,
  provider,
}) => {
  let initializing = false;
  let connectionUpdateTimeout: NodeJS.Timeout;

  const wallet = {
    signIn,
    signOut,
    getAccounts,
    verifyOwner,
    signMessage,
    isSignedIn,
    signAndSendTransaction,
    signAndSendTransactions,
  };
  const env = (metadata as any).env || options.network.networkId || 'mainnet';
  const currentConfig = getWalletConfig(env as ENV);

  await initBtcContext();

  function validateWalletState() {
    const accountId = state.getAccount();
    const publicKey = state.getPublicKey();
    const btcPublicKey = state.getBtcPublicKey();
    if ((!accountId && publicKey) || (accountId && !publicKey) || (!publicKey && btcPublicKey)) {
      state.clear();
      return false;
    }
    return true;
  }

  async function initBtcContext() {
    if (initializing) {
      console.log('BTC context initialization already in progress');
      return;
    }

    console.log('initBtcContext');
    try {
      initializing = true;
      const btcContext = await retryOperation(
        async () => {
          const ctx = window.btcContext;
          if (!ctx) {
            throw new Error('btcContext not found');
          }
          return ctx;
        },
        (res) => !!res,
        {
          maxRetries: 10,
          delayMs: 500,
        },
      );

      await setupBtcContextListeners();
      return btcContext;
    } finally {
      initializing = false;
    }
  }

  async function setupBtcContextListeners() {
    const handleConnectionUpdate = async () => {
      if (connectionUpdateTimeout) {
        clearTimeout(connectionUpdateTimeout);
      }

      await checkBtcNetwork(currentConfig.network);

      if (!state.isValid()) {
        state.clear();
        console.log('setupBtcContextListeners clear');
      }

      const valid = validateWalletState();
      if (!valid) {
        return;
      }

      const btcContext = window.btcContext;
      if (btcContext.account) {
        const btcPublicKey = await btcContext.getPublicKey();
        if (btcPublicKey) {
          await getNearAccountByBtcPublicKey(btcPublicKey);
          removeWalletButton();
          setupWalletButton(env, wallet as any, btcContext);
        }
      } else {
        removeWalletButton();
        connectionUpdateTimeout = setTimeout(() => {
          handleConnectionUpdate();
        }, 5000);
      }
    };

    const context = window.btcContext.getContext();

    context.on('updatePublicKey', async (btcPublicKey: string) => {
      state.clear();
      console.log('updatePublicKey clear');
      try {
        const { nearAddress, nearPublicKey } = await getNearAccountByBtcPublicKey(btcPublicKey);

        if (!nearAddress || !nearPublicKey) {
          throw new Error('Failed to get near account info');
        }

        emitter.emit('accountsChanged', {
          accounts: [{ accountId: nearAddress }],
        });
        await handleConnectionUpdate();
      } catch (error) {
        console.error('Error updating public key:', error);
      }
    });

    context.on('btcLoginError', async () => {
      // console.log('btcLoginError');
      // state.clear();
      // emitter.emit('accountsChanged', { accounts: [] });
      // await handleConnectionUpdate();
    });

    context.on('btcLogOut', async () => {
      console.log('btcLogOut');
      state.clear();
      emitter.emit('accountsChanged', { accounts: [] });
      await handleConnectionUpdate();
    });

    await handleConnectionUpdate();

    if (
      'autoConnect' in metadata &&
      metadata.autoConnect &&
      localStorage.getItem('near-wallet-selector:selectedWalletId') === '"btc-wallet"'
    ) {
      await window.btcContext.autoConnect();
    }
  }

  async function nearCall<T>(contractId: string, methodName: string, args: any) {
    return nearCallFunction<T>(contractId, methodName, args, { provider });
  }

  async function getNearAccountByBtcPublicKey(btcPublicKey: string) {
    const csna = await getCsnaAccountId(env);
    const nearPublicKey = await nearCall<string>(
      currentConfig.accountContractId,
      'get_chain_signature_near_account_public_key',
      { btc_public_key: btcPublicKey },
    );

    state.syncSave(csna, nearPublicKey, btcPublicKey);

    return {
      nearAddress: csna,
      nearPublicKey,
    };
  }

  async function signIn({ contractId, methodNames }: any) {
    const btcContext = window.btcContext;

    state.clear();

    if (!state.getAccount() || !state.getPublicKey()) {
      await btcContext.login();
    }

    const btcPublicKey = await btcContext.getPublicKey();
    console.log('btcPublicKey:', btcPublicKey);
    if (!btcPublicKey) {
      throw new Error('No connected BTC wallet, please connect your BTC wallet first.');
    }

    const { nearAddress, nearPublicKey } = await getNearAccountByBtcPublicKey(btcPublicKey);

    return [
      {
        accountId: nearAddress,
        publicKey: nearPublicKey,
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
  }

  function isSignedIn() {
    const accountId = state.getAccount();
    const publicKey = state.getPublicKey();
    return accountId && publicKey;
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
    if (!validateWalletState()) {
      throw new Error('Wallet state is invalid, please reconnect your wallet.');
    }

    const btcContext = window.btcContext;
    const csna = state.getAccount();

    const accountInfo = await getAccountInfo({ csna, env });

    // check gas token arrears
    await checkGasTokenDebt(csna, env, true);

    const trans = [...params.transactions];
    console.log('signAndSendTransactions raw trans:', trans);

    const { transferGasTransaction, useNearPayGas, gasLimit } = await calculateGasStrategy({
      csna,
      transactions: trans,
      env,
    });

    console.log('transferGasTransaction:', transferGasTransaction);
    console.log('useNearPayGas:', useNearPayGas);
    console.log('gasLimit:', gasLimit);

    // check gas token balance
    await checkGasTokenBalance(csna, gasLimit, env);

    if (transferGasTransaction) {
      trans.unshift(transferGasTransaction);
    }

    console.log('calculateGasStrategy trans:', trans);

    const newTrans = await Promise.all(
      trans.map((transaction, index) =>
        convertTransactionToTxHex({
          transaction,
          accountId: state.getAccount(),
          publicKey: state.getPublicKey(),
          index,
          env,
        }),
      ),
    );

    const nonceFromApi = await getNonce(currentConfig.base_url, csna);

    const nonceFromContract = accountInfo?.nonce || 0;

    const nonce =
      Number(nonceFromApi) > Number(nonceFromContract)
        ? String(nonceFromApi)
        : String(nonceFromContract);

    const intention = {
      chain_id: '397',
      csna,
      near_transactions: newTrans.map((t) => t.txHex),
      gas_token: currentConfig.btcToken,
      gas_limit: gasLimit,
      use_near_pay_gas: useNearPayGas,
      nonce,
      replace: true,
    };

    const strIntention = JSON.stringify(intention);

    const signature = await btcContext.signMessage(strIntention);

    await receiveTransaction(currentConfig.base_url, {
      sig: signature,
      btcPubKey: state.getBtcPublicKey(),
      data: toHex(strIntention),
    });
    await checkBtcTransactionStatus(currentConfig.base_url, signature);

    // Skip the outcome of the first transaction, which is the gas token transfer transaction
    const hash = newTrans.slice(1).map((t) => t.hash);
    console.log('txHash:', hash);
    const result = await pollTransactionStatuses(options.network.networkId, hash);
    return result;
  }

  async function checkBtcNetwork(network: string) {
    const btcContext = window.btcContext;
    if (!btcContext.account) return;
    const btcNetwork = await btcContext.getNetwork();
    const networkMap = {
      livenet: ['mainnet', 'private_mainnet'],
      testnet: ['testnet', 'dev'],
    };
    if (!networkMap[btcNetwork].includes(network)) {
      await btcContext.switchNetwork(btcNetwork === 'livenet' ? 'testnet' : 'livenet');
    }
  }

  return wallet as any;
};

export function setupBTCWallet({
  iconUrl = 'https://assets.deltatrade.ai/assets/chain/btc.svg',
  deprecated = false,
  autoConnect = true,
  syncLogOut = true,
  env = 'mainnet',
}: BTCWalletParams | undefined = {}): WalletModuleFactory<InjectedWallet> {
  console.log('⚡️ BTC Wallet Version:', getVersion(), 'env:', env);

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
        env,
      },
      init: BTCWallet,
    } as any;
  };

  return btcWallet;
}

export default {
  setupBTCWallet,
};
