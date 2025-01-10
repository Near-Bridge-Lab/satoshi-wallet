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
import { delay, retryOperation, toHex } from '../utils';
import type { ENV } from '../config';
import { walletConfig } from '../config';
import { nearCallFunction, pollTransactionStatuses } from '../utils/nearUtils';
import Big from 'big.js';

import {
  checkGasTokenArrears,
  checkGasTokenBalance,
  getAccountInfo,
  getCsnaAccountId,
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
  };
  const env = (metadata as any).env || options.network.networkId || 'mainnet';
  const currentConfig = walletConfig[env as ENV];
  const walletNetwork = ['mainnet', 'private_mainnet'].includes(env) ? 'mainnet' : 'testnet';

  await initBtcContext();

  async function setupBtcContextListeners() {
    const handleConnectionUpdate = async () => {
      await checkBtcNetwork(walletNetwork);
      const accountId = state.getAccount();
      const btcContext = window.btcContext;
      if (accountId && btcContext.account) {
        removeWalletButton();
        setupWalletButton(env, wallet as any, btcContext);
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
      const { nearAddress } = await getNearAccountByBtcPublicKey(btcPublicKey);

      emitter.emit('accountsChanged', {
        accounts: [{ accountId: nearAddress }],
      });
      await handleConnectionUpdate();
    });

    context.on('btcLoginError', async () => {
      console.log('btcLoginError');
      emitter.emit('accountsChanged', { accounts: [] });
      await handleConnectionUpdate();
    });

    context.on('btcLogOut', async () => {
      console.log('btcLogOut');
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

    state.saveAccount(csna);
    state.savePublicKey(nearPublicKey);
    state.saveBtcPublicKey(btcPublicKey);

    return {
      nearAddress: csna,
      nearPublicKey,
    };
  }

  async function signIn({ contractId, methodNames }: any) {
    const btcContext = window.btcContext;
    const accountId = state.getAccount();
    const publicKey = state.getPublicKey();

    console.log('isLogin:', accountId && publicKey);

    if (!accountId || !publicKey) {
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
    const btcContext = window.btcContext;
    const accountId = state.getAccount();

    const accountInfo = await getAccountInfo(accountId, currentConfig.accountContractId);

    // check gas token arrears
    await checkGasTokenArrears(accountInfo, env, true);

    const trans = [...params.transactions];
    console.log('raw trans:', trans);

    const gasTokenBalance = accountInfo?.gas_token[currentConfig.token] || '0';

    const { transferGasTransaction, useNearPayGas, gasLimit } = await calculateGasStrategy(
      gasTokenBalance,
      trans,
    );

    console.log('transferGasTransaction:', transferGasTransaction);
    console.log('useNearPayGas:', useNearPayGas);
    console.log('gasLimit:', gasLimit);

    // check gas token balance
    await checkGasTokenBalance(accountId, currentConfig.token, gasLimit, env);

    if (transferGasTransaction) {
      trans.unshift(transferGasTransaction);
    }

    console.log('calculateGasStrategy trans:', trans);

    const newTrans = await Promise.all(
      trans.map((transaction, index) => convertTransactionToTxHex(transaction, index)),
    );

    const nonceFromApi = await getNonce(currentConfig.base_url, accountId as string);

    const nonce =
      Number(nonceFromApi) > Number(accountInfo?.nonce)
        ? String(nonceFromApi)
        : String(accountInfo?.nonce);

    const intention = {
      chain_id: '397',
      csna: accountId,
      near_transactions: newTrans.map((t) => t.txHex),
      gas_token: currentConfig.token,
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

    const hash = newTrans.map((t) => t.hash);
    console.log('txHash:', hash);
    const result = await pollTransactionStatuses(options.network.networkId, hash);
    return result;
  }

  async function createGasTokenTransfer(accountId: string, amount: string) {
    return {
      signerId: accountId,
      receiverId: currentConfig.token,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'ft_transfer_call',
            args: {
              receiver_id: currentConfig.accountContractId,
              amount,
              msg: JSON.stringify('Deposit'),
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
        currentConfig.token,
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
    console.log('predictedGas:', predictedGasAmount);
    return predictedGasAmount;
  }

  async function calculateGasStrategy(
    gasTokenBalance: string,
    transactions: Transaction[],
  ): Promise<{
    transferGasTransaction?: Transaction;
    useNearPayGas: boolean;
    gasLimit: string;
  }> {
    const accountId = state.getAccount();

    // check near balance
    const nearAccount = await provider.query<any>({
      request_type: 'view_account',
      account_id: accountId,
      finality: 'final',
    });
    const availableBalance = parseFloat(nearAccount.amount) / 10 ** 24;

    console.log('available near balance:', availableBalance);

    console.log('available gas token balance:', gasTokenBalance);

    const convertTx = await Promise.all(
      transactions.map((transaction, index) => convertTransactionToTxHex(transaction, index)),
    );

    if (availableBalance > 0.2) {
      console.log('near balance is enough, get the protocol fee of each transaction');
      const gasTokens = await nearCall<Record<string, { per_tx_protocol_fee: string }>>(
        currentConfig.accountContractId,
        'list_gas_token',
        { token_ids: [currentConfig.token] },
      );

      console.log('list_gas_token gas tokens:', gasTokens);

      const perTxFee = Math.max(
        Number(gasTokens[currentConfig.token]?.per_tx_protocol_fee || 0),
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
        currentConfig.token,
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
