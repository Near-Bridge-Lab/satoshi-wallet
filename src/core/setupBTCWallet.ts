import type {
  Transaction,
  InjectedWallet,
  WalletModuleFactory,
  WalletBehaviourFactory,
} from '@near-wallet-selector/core';
import { transactions } from 'near-api-js';
import type { AccessKeyViewRaw } from 'near-api-js/lib/providers/provider';
import { actionCreators } from '@near-js/transactions';

import { PublicKey } from 'near-api-js/lib/utils/key_pair';
import { encodeTransaction } from 'near-api-js/lib/transaction';
import { baseDecode } from '@near-js/utils';
import bs58 from 'bs58';
import { sha256 } from 'js-sha256';
import { setupWalletButton, removeWalletButton } from '../utils/initWalletButton';
import type { useBtcWalletSelector } from './btcWalletSelectorContext';
import { retryOperation, toHex } from '../utils';
import type { ENV } from '../config';
import { walletConfig } from '../config';
import { nearCallFunction, pollTransactionStatuses } from '../utils/nearUtils';
import Big from 'big.js';

import {
  checkGasTokenDebt,
  checkGasTokenBalance,
  checkSatoshiWhitelist,
  getAccountInfo,
  getCsnaAccountId,
  getTokenBalance,
} from './btcUtils';

import {
  checkBtcTransactionStatus,
  getNearNonce,
  getNonce,
  receiveTransaction,
} from '../utils/satoshi';
import { getVersion } from '../index';

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
  env?: ENV;
}

const STORAGE_KEYS = {
  ACCOUNT: 'btc-wallet-account',
  PUBLIC_KEY: 'btc-wallet-publickey',
  BTC_PUBLIC_KEY: 'btc-wallet-btc-publickey',
} as const;

const state: any = {
  saveAccount(account: string) {
    if (!account) {
      this.removeAccount();
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.ACCOUNT, account);
  },
  removeAccount() {
    window.localStorage.removeItem(STORAGE_KEYS.ACCOUNT);
  },
  savePublicKey(publicKey: string) {
    if (!publicKey) {
      this.removePublicKey();
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.PUBLIC_KEY, publicKey);
  },
  removePublicKey() {
    window.localStorage.removeItem(STORAGE_KEYS.PUBLIC_KEY);
  },
  saveBtcPublicKey(publicKey: string) {
    if (!publicKey) {
      this.removeBtcPublicKey();
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.BTC_PUBLIC_KEY, publicKey);
  },
  removeBtcPublicKey() {
    window.localStorage.removeItem(STORAGE_KEYS.BTC_PUBLIC_KEY);
  },
  clear() {
    this.removeAccount();
    this.removePublicKey();
    this.removeBtcPublicKey();
  },
  save(account: string, publicKey: string) {
    if (!account || !publicKey) {
      this.clear();
      return;
    }
    this.saveAccount(account);
    this.savePublicKey(publicKey);
  },
  getAccount() {
    return window.localStorage.getItem(STORAGE_KEYS.ACCOUNT);
  },
  getPublicKey() {
    return window.localStorage.getItem(STORAGE_KEYS.PUBLIC_KEY);
  },
  getBtcPublicKey() {
    return window.localStorage.getItem(STORAGE_KEYS.BTC_PUBLIC_KEY);
  },
  isValid() {
    const account = this.getAccount();
    const publicKey = this.getPublicKey();
    const btcPublicKey = this.getBtcPublicKey();

    const allEmpty = !account && !publicKey && !btcPublicKey;
    const allExist = account && publicKey && btcPublicKey;

    return allEmpty || allExist;
  },
  syncSave(account: string, publicKey: string, btcPublicKey: string) {
    if (!account || !publicKey || !btcPublicKey) {
      this.clear();
      return;
    }

    this.clear();

    this.savePublicKey(publicKey);
    this.saveBtcPublicKey(btcPublicKey);
    this.saveAccount(account);
  },
};

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
    isSignedIn,
    signAndSendTransaction,
    signAndSendTransactions,
    calculateGasLimit,
  };
  const env = (metadata as any).env || options.network.networkId || 'mainnet';
  const currentConfig = walletConfig[env as ENV];
  const walletNetwork = ['mainnet', 'private_mainnet'].includes(env) ? 'mainnet' : 'testnet';

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

  async function setupBtcContextListeners() {
    const handleConnectionUpdate = async () => {
      await checkBtcNetwork(walletNetwork);

      if (!state.isValid()) {
        state.clear();
        console.log('setupBtcContextListeners clear');
      }

      validateWalletState();
      const btcContext = window.btcContext;
      if (btcContext.account) {
        const btcPublicKey = await btcContext.getPublicKey();
        if (btcPublicKey) {
          await getNearAccountByBtcPublicKey(btcPublicKey);
          await checkSatoshiWhitelist(btcContext.account, env);
          removeWalletButton();
          setupWalletButton(env, wallet as any, btcContext);
        }
      } else {
        removeWalletButton();
        setTimeout(() => {
          handleConnectionUpdate();
        }, 5000);
      }
    };

    const context = window.btcContext.getContext();

    context.on('updatePublicKey', async (btcPublicKey: string) => {
      console.log('updatePublicKey');
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

  async function initBtcContext() {
    console.log('initBtcContext');
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
    console.log('signAndSendTransactions', params);
    if (!validateWalletState()) {
      throw new Error('Wallet state is invalid, please reconnect your wallet.');
    }

    const btcContext = window.btcContext;
    const csna = state.getAccount();

    const accountInfo = await getAccountInfo({ csna, env });

    // check gas token arrears
    await checkGasTokenDebt(accountInfo, env, true);

    const trans = [...params.transactions];
    console.log('signAndSendTransactions raw trans:', trans);

    const { transferGasTransaction, useNearPayGas, gasLimit } = await calculateGasStrategy(trans);

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
      trans.map((transaction, index) => convertTransactionToTxHex(transaction, index)),
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

  async function calculateGasLimit(params: { transactions: Transaction[] }) {
    const trans = [...params.transactions];
    console.log('raw trans:', trans);

    const { gasLimit } = await calculateGasStrategy(trans);

    return gasLimit;
  }

  async function createGasTokenTransfer(accountId: string, amount: string) {
    return {
      signerId: accountId,
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

  async function recalculateGasWithTransfer(
    transferTx: Transaction,
    transactions: { txHex: string }[],
    useNearPayGas: boolean,
    perTxFee?: string,
  ) {
    const { txHex: transferTxHex } = await convertTransactionToTxHex(transferTx);

    let newGasLimit;
    if (useNearPayGas && perTxFee) {
      newGasLimit = new Big(perTxFee).mul(transactions.length + 1).toFixed(0);
    } else {
      newGasLimit = await getPredictedGasAmount(
        currentConfig.accountContractId,
        currentConfig.btcToken,
        [transferTxHex, ...transactions.map((t) => t.txHex)],
      );
    }

    (transferTx.actions[0] as any).params.args.amount = newGasLimit;

    return { transferGasTransaction: transferTx, useNearPayGas, gasLimit: newGasLimit };
  }

  async function getPredictedGasAmount(
    accountContractId: string,
    tokenId: string,
    transactions: string[],
  ): Promise<string> {
    const predictedGas = await nearCall<string>(accountContractId, 'predict_txs_gas_token_amount', {
      gas_token_id: tokenId,
      near_transactions: transactions,
    });

    const predictedGasAmount = new Big(predictedGas).mul(1.2).toFixed(0);
    const miniGasAmount = 200 * transactions.length;
    const gasAmount = Math.max(Number(predictedGasAmount), miniGasAmount);
    console.log('predictedGas:', predictedGasAmount);
    return gasAmount.toString();
  }

  async function calculateGasStrategy(transactions: Transaction[]): Promise<{
    transferGasTransaction?: Transaction;
    useNearPayGas: boolean;
    gasLimit: string;
  }> {
    const accountId = state.getAccount();

    const accountInfo = await getAccountInfo({ csna: accountId, env });
    const gasTokenBalance = accountInfo?.gas_token[currentConfig.btcToken] || '0';
    const nearBalance = await getTokenBalance({
      csna: accountId,
      tokenId: currentConfig.nearToken,
      env,
    });
    const btcBalance = await getTokenBalance({
      csna: accountId,
      tokenId: currentConfig.btcToken,
      env,
    });

    const transferAmount = transactions.reduce(
      (acc, tx) => {
        // transfer near
        if (tx.actions[0].type === 'Transfer') {
          const amount =
            Number(tx.actions[0].params.deposit) / 10 ** currentConfig.nearTokenDecimals;
          return { near: acc.near.add(amount), btc: acc.btc };
        }
        // function call
        if (tx.actions[0].type === 'FunctionCall') {
          tx.actions.forEach((action: any) => {
            if (
              [currentConfig.nearToken, currentConfig.btcToken].includes(tx.receiverId) &&
              ['ft_transfer_call', 'ft_transfer'].includes(action.params.methodName)
            ) {
              const nearAmount =
                tx.receiverId === currentConfig.nearToken
                  ? Number(action.params.args.amount) / 10 ** currentConfig.nearTokenDecimals
                  : 0;
              const btcAmount =
                tx.receiverId === currentConfig.btcToken
                  ? Number(action.params.args.amount) / 10 ** currentConfig.btcTokenDecimals
                  : 0;
              return { near: acc.near.add(nearAmount), btc: acc.btc.add(btcAmount) };
            }
            return acc;
          });
        }
        return acc;
      },
      { near: new Big(0), btc: new Big(0) },
    );

    console.log('transferAmount near:', transferAmount.near.toString());
    console.log('transferAmount btc:', transferAmount.btc.toString());

    console.log('available near balance:', nearBalance);

    console.log('available gas token balance:', gasTokenBalance);

    const convertTx = await Promise.all(
      transactions.map((transaction, index) => convertTransactionToTxHex(transaction, index)),
    );

    if (nearBalance > 0.5) {
      console.log('near balance is enough, get the protocol fee of each transaction');
      const gasTokens = await nearCall<Record<string, { per_tx_protocol_fee: string }>>(
        currentConfig.accountContractId,
        'list_gas_token',
        { token_ids: [currentConfig.btcToken] },
      );

      console.log('list_gas_token gas tokens:', gasTokens);

      const perTxFee = Math.max(
        Number(gasTokens[currentConfig.btcToken]?.per_tx_protocol_fee || 0),
        100,
      );
      console.log('perTxFee:', perTxFee);
      const protocolFee = new Big(perTxFee || '0').mul(convertTx.length).toFixed(0);
      console.log('protocolFee:', protocolFee);

      if (new Big(gasTokenBalance).gte(protocolFee)) {
        console.log('use near pay gas and enough gas token balance');
        return { useNearPayGas: true, gasLimit: protocolFee };
      } else {
        console.log('use near pay gas and not enough gas token balance');
        // gas token balance is not enough, need to transfer
        const transferTx = await createGasTokenTransfer(accountId, protocolFee);
        return recalculateGasWithTransfer(transferTx, convertTx, true, perTxFee.toString());
      }
    } else {
      console.log('near balance is not enough, predict the gas token amount required');
      const adjustedGas = await getPredictedGasAmount(
        currentConfig.accountContractId,
        currentConfig.btcToken,
        convertTx.map((t) => t.txHex),
      );

      if (new Big(gasTokenBalance).gte(adjustedGas)) {
        console.log('use gas token and gas token balance is enough');
        return { useNearPayGas: false, gasLimit: adjustedGas };
      } else {
        console.log('use gas token and gas token balance is not enough, need to transfer');
        const transferTx = await createGasTokenTransfer(accountId, adjustedGas);
        return recalculateGasWithTransfer(transferTx, convertTx, false);
      }
    }
  }

  // add utility function for converting Transaction to txHex
  async function convertTransactionToTxHex(transaction: Transaction, index = 0) {
    const accountId = state.getAccount();
    const publicKey = state.getPublicKey();
    const publicKeyFormat = PublicKey.from(publicKey);

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
