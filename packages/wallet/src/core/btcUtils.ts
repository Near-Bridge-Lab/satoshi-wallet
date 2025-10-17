import Big from 'big.js';
import type { ENV } from '../config';
import { getWalletConfig, btcRpcUrls } from '../config';
import { retryOperation, storageStore } from '../utils';
import { nearCallFunction, pollTransactionStatuses } from '../utils/nearUtils';
import {
  checkBridgeTransactionStatus,
  getAccountInfo,
  getBridgeConfig,
  getWhitelist,
  preReceiveDepositMsg,
  receiveDepositMsg,
  calculateGasLimit,
  calculateGasStrategy,
  hasBridgeTransaction,
} from '../utils/satoshi';
import { Dialog } from '../utils/Dialog';
import type { FinalExecutionOutcome, Transaction } from '@near-wallet-selector/core';
import * as bitcoin from 'bitcoinjs-lib';
// @ts-ignore
import coinselect from 'coinselect';
// @ts-ignore
import * as ecc from '@bitcoinerlab/secp256k1';
import bs58 from 'bs58';

export { calculateGasLimit, calculateGasStrategy, checkBridgeTransactionStatus };

// init ecc lib
bitcoin.initEccLib(ecc);

/** NEAR Storage Deposit Amount */
const NEAR_STORAGE_DEPOSIT_AMOUNT = '1250000000000000000000';
/** NBTC Storage Deposit Amount */
const NBTC_STORAGE_DEPOSIT_AMOUNT = 800;
/** New account min deposit amount */
const NEW_ACCOUNT_MIN_DEPOSIT_AMOUNT = 1000;

function getBtcProvider() {
  if (typeof window === 'undefined' || !window.btcContext) {
    throw new Error('BTC Provider is not initialized.');
  }
  return window.btcContext;
}

async function getNetwork() {
  try {
    const network = await getBtcProvider().getNetwork();
    console.log('btc network:', network);
    return network === 'livenet' ? 'mainnet' : 'testnet';
  } catch (error) {
    return 'mainnet';
  }
}

function formatBtcAmount(amount: number | string) {
  return new Big(amount).div(10 ** 8).toFixed();
}

async function getBtcRpcUrl() {
  const network = await getNetwork();
  return btcRpcUrls[network as keyof typeof btcRpcUrls];
}

async function nearCall<T>(contractId: string, methodName: string, args: any) {
  const network = await getNetwork();
  return nearCallFunction<T>(contractId, methodName, args, { network });
}

type CheckGasTokenDebtReturnType<T extends boolean> = T extends true
  ? void
  : { receiver_id: string; amount: string; msg: string } | undefined;

export async function checkGasTokenDebt<T extends boolean>({
  csna,
  btcAccount,
  env,
  autoDeposit,
}: {
  csna: string;
  btcAccount: string;
  env: ENV;
  autoDeposit?: T;
}): Promise<CheckGasTokenDebtReturnType<T>> {
  const isNewAccount = await checkNewAccount({ csna, btcAccount, env });
  const accountInfo = await getAccountInfo({ csna, env });
  const debtAmount = new Big(accountInfo?.debt_info?.near_gas_debt_amount || 0)
    .plus(accountInfo?.debt_info?.protocol_fee_debt_amount || 0)
    .toString();
  const relayerFeeAmount = isNewAccount
    ? NBTC_STORAGE_DEPOSIT_AMOUNT
    : accountInfo?.relayer_fee?.amount || 0;
  const hasDebtArrears = new Big(debtAmount).gt(0);
  const hasRelayerFeeArrears = new Big(relayerFeeAmount).gt(0);
  if (!hasDebtArrears && !hasRelayerFeeArrears) return;
  const config = getWalletConfig(env);
  const transferAmount = hasDebtArrears ? debtAmount : relayerFeeAmount;

  const action = {
    receiver_id: config.accountContractId,
    amount: transferAmount.toString(),
    msg: JSON.stringify(hasDebtArrears ? 'Repay' : 'RelayerFee'),
  };

  if (!autoDeposit) return action as CheckGasTokenDebtReturnType<T>;

  console.log('checkGasTokenDebt action:', action);

  const { minDepositAmount } = await getDepositAmount(action.amount, {
    env,
  });

  const remainingAmount = new Big(minDepositAmount).minus(transferAmount).toNumber();

  const confirmed = await Dialog.confirm({
    title: hasDebtArrears ? 'Gas Token Arrears' : 'Relayer Fee Arrears',
    message: hasDebtArrears
      ? `You have gas token arrears. Minimum deposit amount is ${formatBtcAmount(minDepositAmount)} BTC, of which ${formatBtcAmount(transferAmount)} BTC will be used to repay the debt, and the remaining ${formatBtcAmount(remainingAmount)} BTC will be credited to your account.`
      : `You have relayer fee arrears. Minimum deposit amount is ${formatBtcAmount(minDepositAmount)} BTC, of which ${formatBtcAmount(transferAmount)} BTC will be used for relayer fee, and the remaining ${formatBtcAmount(remainingAmount)} BTC will be credited to your account.`,
  });

  if (confirmed) {
    await executeBTCDepositAndAction({ amount: minDepositAmount.toString(), action, env });

    await Dialog.alert({
      title: 'Deposit Success',
      message: `Deposit successful. ${formatBtcAmount(transferAmount)} BTC has been paid for ${hasDebtArrears ? 'debt' : 'relayer fee'}, and the remaining ${formatBtcAmount(remainingAmount)} BTC has been credited to your account. Transaction will continue.`,
    });
  } else {
    throw new Error('Deposit failed, please deposit gas token first.');
  }
}

interface DepositMsg {
  recipient_id: string;
  post_actions?: Array<{
    receiver_id: string;
    amount: string;
    memo?: string;
    msg: string;
    gas?: string;
  }>;
  extra_msg?: string;
}

export async function getBtcGasPrice(
  type: 'fastest' | 'halfHour' | 'hour' | 'economy' | 'minimum' = 'halfHour',
): Promise<number> {
  const network = await getNetwork();
  const defaultFeeRate = network === 'mainnet' ? 5 : 2500;
  try {
    const btcRpcUrl = await getBtcRpcUrl();
    const res = await fetch(`${btcRpcUrl}/v1/fees/recommended`).then((res) => res.json());
    const feeRate = res[type + 'Fee'] ? Number(res[type + 'Fee']) : defaultFeeRate;
    return feeRate;
  } catch (error) {
    return defaultFeeRate;
  }
}

export async function getBtcUtxos(account: string) {
  const btcRpcUrl = await getBtcRpcUrl();
  const utxos: { value: number; status: { confirmed: boolean } }[] = await fetch(
    `${btcRpcUrl}/address/${account}/utxo`,
  ).then((res) => res.json());
  return utxos.filter((item) => item.status.confirmed);
}

export async function calculateGasFee(account: string, amount: number, feeRate?: number) {
  const _feeRate = feeRate || (await getBtcGasPrice());
  const utxos = await getBtcUtxos(account);
  const { fee } = coinselect(utxos, [{ address: account, value: amount }], Math.ceil(_feeRate));
  console.log('calculateGasFee fee:', fee, 'feeRate:', _feeRate);
  return fee;
}

export async function getBtcBalance(account?: string) {
  if (!account) {
    const res = await retryOperation(getBtcProvider, (res) => !!res.account);

    if (!res.account) {
      console.error('BTC Account is not available.');
      return { rawBalance: 0, balance: 0, availableBalance: 0 };
    }
    account = res.account;
  }

  const utxos = await getBtcUtxos(account);

  const btcDecimals = 8;

  const rawBalance = utxos?.reduce((acc, cur) => acc + cur.value, 0) || 0;
  const balance = rawBalance / 10 ** btcDecimals;

  const estimatedFee = await calculateGasFee(account, rawBalance);

  const availableRawBalance = (rawBalance - estimatedFee).toFixed(0);

  const availableBalance = new Big(availableRawBalance)
    .div(10 ** btcDecimals)
    .round(btcDecimals, Big.roundDown)
    .toNumber();

  return {
    rawBalance,
    balance,
    availableBalance: Math.max(availableBalance, 0),
  };
}

export async function sendBitcoin(address: string, amount: number, feeRate: number) {
  const { sendBitcoin } = getBtcProvider();
  const txHash = await sendBitcoin(address, amount, { feeRate });
  return txHash;
}

export async function getPublicKeyBase58() {
  const { getPublicKey } = getBtcProvider();
  const publicKey = await getPublicKey();
  const publicKeyBuffer = Buffer.from(publicKey, 'hex');
  let uncompressedPublicKey: Uint8Array;

  if (publicKeyBuffer.length === 33) {
    // Compressed public key (33 bytes), decompress it using ecc.pointCompress
    const decompressed = ecc.pointCompress(publicKeyBuffer, false);
    if (!decompressed) {
      throw new Error('Failed to decompress public key');
    }
    uncompressedPublicKey = decompressed;
  } else if (publicKeyBuffer.length === 65) {
    // Already uncompressed (65 bytes)
    uncompressedPublicKey = publicKeyBuffer;
  } else {
    throw new Error(`Invalid public key length: ${publicKeyBuffer.length}`);
  }

  // Remove first byte (0x04 prefix), keep 64 bytes
  const publicKeyWithoutPrefix = uncompressedPublicKey.subarray(1);
  const publicKeyBase58 = bs58.encode(publicKeyWithoutPrefix);
  return publicKeyBase58;
}

export async function signMessage(message: string) {
  const { signMessage, getPublicKey } = getBtcProvider();
  const publicKey = await getPublicKey();
  const signature = await signMessage(message);

  return { signature, publicKey };
}

/** estimate deposit receive amount, deduct protocol fee and repay amount */
export async function estimateDepositAmount(
  amount: string,
  option?: {
    env?: ENV;
  },
) {
  return amount;
}

export async function getDepositAmount(
  amount: string,
  option?: {
    csna?: string;
    btcAccount?: string;
    env?: ENV;
    /** default is true, if true, new account minimum deposit amount 1000sat, otherwise 0 */
    newAccountMinDepositAmount?: boolean;
  },
) {
  const env = option?.env || 'mainnet';
  const _newAccountMinDepositAmount = option?.newAccountMinDepositAmount ?? true;
  const csna = option?.csna || (await getCsnaAccountId(env));
  const btcAccount = option?.btcAccount || getBtcProvider().account;
  const accountInfo = await getAccountInfo({ csna, env });
  const debtAction = await checkGasTokenDebt({ csna, btcAccount, env, autoDeposit: false });
  const repayAmount = debtAction?.amount || 0;
  const depositAmount = Number(amount);
  const {
    deposit_bridge_fee: { fee_min, fee_rate },
    min_deposit_amount,
  } = await getBridgeConfig({ env });

  const protocolFee = Math.max(Number(fee_min), depositAmount * fee_rate);
  const newAccountMinDepositAmount =
    !accountInfo?.nonce && _newAccountMinDepositAmount ? NEW_ACCOUNT_MIN_DEPOSIT_AMOUNT : 0;
  let receiveAmount = new Big(depositAmount)
    .minus(protocolFee)
    .minus(repayAmount)
    .round(0, Big.roundDown)
    .toNumber();
  receiveAmount = Math.max(receiveAmount, 0);

  const minDepositAmount = new Big(min_deposit_amount || 0)
    .plus(newAccountMinDepositAmount)
    .plus(protocolFee)
    .plus(repayAmount)
    .round(0, Big.roundUp)
    .toNumber();

  console.log(
    `minDepositAmount: ${minDepositAmount} = ${min_deposit_amount} + ${newAccountMinDepositAmount} + ${protocolFee} + ${repayAmount}`,
  );

  return {
    depositAmount,
    receiveAmount,
    protocolFee,
    repayAmount,
    newAccountMinDepositAmount,
    minDepositAmount,
  };
}

export async function getCsnaAccountId(env: ENV) {
  const config = getWalletConfig(env);
  const { getPublicKey } = getBtcProvider();
  const btcPublicKey = await getPublicKey();
  if (!btcPublicKey) {
    throw new Error('BTC Public Key is not available.');
  }
  const csna = await nearCall<string>(
    config.accountContractId,
    'get_chain_signature_near_account_id',
    {
      btc_public_key: btcPublicKey,
    },
  );
  return csna;
}

export async function checkNewAccount({
  csna,
  btcAccount,
  env = 'mainnet',
}: {
  csna?: string;
  btcAccount?: string;
  env?: ENV;
}) {
  try {
    const _csna = csna || (await getCsnaAccountId(env));
    const _btcAccount = btcAccount || getBtcProvider().account;
    if (!_csna || !_btcAccount) return false;
    const accountInfo = await getAccountInfo({ csna: _csna, env });
    const bridgeTransactions = await hasBridgeTransaction({
      env,
      btcAccount: _btcAccount,
    });
    const isNewAccount = !accountInfo?.nonce && !bridgeTransactions;
    return isNewAccount;
  } catch (error) {
    console.error('checkNewAccount error:', error);
    return false;
  }
}

function checkDepositDisabledAddress() {
  const data =
    storageStore('SATOSHI_WALLET_XVERSE')?.get<{ walletType: string; addressType: string }[]>(
      `Mainnet:addresses`,
    );
  if (!data) return;
  const address = data?.[0];
  if (address.walletType === 'ledger' && !['p2wpkh', 'p2sh'].includes(address.addressType)) {
    throw new Error('Ledger is only supported for p2wpkh and p2sh address');
  }
}

interface ExecuteBTCDepositAndActionParams<T extends boolean = true> {
  action?: {
    receiver_id: string;
    amount: string;
    msg: string;
  };
  amount?: string;
  /** if registerDeposit is true, It will consume the deposit, otherwise it will be 0.000125 NEAR */
  registerDeposit?: string;
  feeRate?: number;
  env?: ENV;
  pollResult?: T;
  newAccountMinDepositAmount?: boolean;
  /** if registerContractId is provided, it will be used to register the contract, otherwise it will be the default contract id */
  registerContractId?: string;
}

/**
 * @param T - if true, return the poll result, otherwise return the btcTxHash
 */
type ExecuteBTCDepositAndActionReturn<T extends boolean> = T extends true
  ? FinalExecutionOutcome[]
  : string;

export async function executeBTCDepositAndAction<T extends boolean = true>({
  action,
  amount,
  feeRate,
  pollResult = true as T,
  registerDeposit,
  env = 'mainnet',
  newAccountMinDepositAmount,
  registerContractId,
}: ExecuteBTCDepositAndActionParams<T>): Promise<ExecuteBTCDepositAndActionReturn<T>> {
  try {
    console.log('executeBTCDepositAndAction start', {
      action,
      amount,
      feeRate,
      pollResult,
      registerDeposit,
      newAccountMinDepositAmount,
      registerContractId,
    });
    checkDepositDisabledAddress();
    const { getPublicKey, account: btcAccount } = getBtcProvider();

    const config = getWalletConfig(env);

    const btcPublicKey = await getPublicKey();

    if (!btcPublicKey) {
      throw new Error('BTC Public Key is not available.');
    }
    if (!amount && !action) {
      throw new Error('Deposit amount or action is required');
    }

    const csna = await getCsnaAccountId(env);

    const depositAmount = new Big(amount || action?.amount || 0).round(0, Big.roundDown).toNumber();

    console.log('depositAmount', depositAmount);

    if (depositAmount <= 0) {
      throw new Error('Invalid deposit amount');
    }

    const { receiveAmount, protocolFee, repayAmount, minDepositAmount } = await getDepositAmount(
      depositAmount.toString(),
      {
        env,
        newAccountMinDepositAmount,
      },
    );

    if (depositAmount < minDepositAmount) {
      throw new Error(
        `Invalid deposit amount, must be greater than ${formatBtcAmount(minDepositAmount)} BTC`,
      );
    }

    const accountInfo = await getAccountInfo({ csna, env });

    const newActions = [];

    const debtAction = await checkGasTokenDebt({ csna, btcAccount, env, autoDeposit: false });

    if (debtAction) {
      newActions.push({
        ...debtAction,
        gas: '30000000000000', // 30 TGas
      });
    }

    // if action is not provided, and the gas token balance is less than the minimum deposit amount, then add the deposit action
    if (action) {
      newActions.push({
        ...action,
        gas: '100000000000000', // 100 TGas
      });
    }

    const storageDepositMsg: {
      storage_deposit_msg?: {
        contract_id: string;
        deposit: string;
        registration_only: boolean;
      };
      btc_public_key?: string;
    } = {};

    const _registerContractId =
      registerContractId ||
      (action?.receiver_id || config.btcToken).replace(config.accountContractId, config.btcToken);
    console.log('executeBTCDepositAndAction registerContractId', _registerContractId);
    // check receiver_id is registered
    const registerRes = await nearCall<{
      available: string;
      total: string;
    }>(_registerContractId, 'storage_balance_of', {
      account_id: csna,
    });

    if (!registerRes?.available) {
      storageDepositMsg.storage_deposit_msg = {
        contract_id: _registerContractId,
        deposit: registerDeposit || NEAR_STORAGE_DEPOSIT_AMOUNT,
        registration_only: true,
      };
    }
    // check account is registerer
    if (!accountInfo?.nonce) {
      storageDepositMsg.btc_public_key = btcPublicKey;
    }

    const depositMsg: DepositMsg = {
      recipient_id: csna,
      post_actions: newActions.length > 0 ? newActions : undefined,
      extra_msg:
        Object.keys(storageDepositMsg).length > 0 ? JSON.stringify(storageDepositMsg) : undefined,
    };

    console.log('get_user_deposit_address params:', { deposit_msg: depositMsg });
    const userDepositAddress = await nearCall<string>(
      config.bridgeContractId,
      'get_user_deposit_address',
      { deposit_msg: depositMsg },
    );
    const _feeRate = feeRate || (await getBtcGasPrice());

    // deposit amount detail
    console.table({
      'User Deposit Address': userDepositAddress,
      'Deposit Amount': Number(depositAmount),
      'Protocol Fee': Number(protocolFee),
      'Repay Amount': Number(repayAmount),
      'Receive Amount': Number(receiveAmount),
      'Fee Rate': Number(_feeRate),
    });

    const postActionsStr = newActions.length > 0 ? JSON.stringify(newActions) : undefined;

    await preReceiveDepositMsg({
      env,
      btcPublicKey,
      depositType: postActionsStr || depositMsg.extra_msg ? 1 : 0,
      postActions: postActionsStr,
      extraMsg: depositMsg.extra_msg,
      userDepositAddress,
    });

    const txHash = await sendBitcoin(userDepositAddress, depositAmount, _feeRate);

    await receiveDepositMsg({
      env,
      btcPublicKey,
      txHash,
      depositType: postActionsStr || depositMsg.extra_msg ? 1 : 0,
      postActions: postActionsStr,
      extraMsg: depositMsg.extra_msg,
    });

    if (!pollResult) {
      return txHash as ExecuteBTCDepositAndActionReturn<T>;
    }

    const checkTransactionStatusRes = await checkBridgeTransactionStatus({
      txHash,
      fromChain: 'BTC',
      env,
    });
    const network = await getNetwork();
    const result = await pollTransactionStatuses(network, [checkTransactionStatusRes.ToTxHash]);
    return result as ExecuteBTCDepositAndActionReturn<T>;
  } catch (error: any) {
    console.error('executeBTCDepositAndAction error:', error);
    throw error;
  }
}

export async function checkSatoshiWhitelist(btcAccountId: string, env: ENV = 'mainnet') {
  if (env !== 'mainnet') return;
  const storage = storageStore();
  const hasShownNotice = storage?.get<string>('private-mainnet-notice');
  if (!hasShownNotice) {
    Dialog.alert({
      title: 'Notice',
      message:
        'You are currently using Satoshi Private Mainnet. This is a private version for testing. Please try a small amount of assets in Ramp',
    });
    storage?.set('private-mainnet-notice', 'true');
  }
  if (!btcAccountId) return;
  const whitelist = await getWhitelist({ env });
  if (!whitelist?.length) return;
  const isWhitelisted = whitelist.includes(btcAccountId);
  if (!isWhitelisted) {
    Dialog.alert({
      title: 'Account is not whitelisted',
      message: `We're live on beta mainnet! Join the whitelist to on-ramp your BTC in just 24 hours.
Sign up now: <a style="color: #ff7a00; text-decoration: underline;" href="https://forms.gle/rrTP1ZbGU5mRZpHdA" target="_blank">https://forms.gle/rrTP1ZbGU5mRZpHdA</a>`,
      dangerouslyUseHTML: true,
      closable: false,
    });
    throw new Error('Account is not whitelisted');
  }
}

interface WithdrawParams {
  amount: string | number;
  feeRate?: number;
  csna?: string;
  btcAddress?: string;
  env?: ENV;
}

export async function getWithdrawTransaction({
  amount,
  feeRate,
  csna,
  btcAddress,
  env = 'mainnet',
}: WithdrawParams): Promise<Transaction> {
  const config = getWalletConfig(env);
  let _btcAddress = btcAddress || getBtcProvider().account;
  if (!_btcAddress) {
    await getBtcProvider().autoConnect();
    _btcAddress = getBtcProvider().account;
    if (!_btcAddress) {
      throw new Error('BTC Account is not available.');
    }
  }
  const _csna = csna || (await getCsnaAccountId(env));

  // calculate gas and get transaction details
  const { inputs, outputs, isError, errorMsg, fromAmount, gasFee } = await calculateWithdraw({
    amount,
    feeRate,
    csna: _csna,
    btcAddress: _btcAddress,
    env,
  });

  if (isError || !inputs || !outputs) {
    throw new Error(errorMsg);
  }
  console.log('inputs:', JSON.stringify(inputs));
  console.log('outputs:', JSON.stringify(outputs));

  console.log('inputs - outputs = gas');
  console.log(
    `(${inputs.map((item) => item.value).join(' + ')}) - (${outputs.map((item) => item.value).join(' + ')}) = ${gasFee}`,
  );

  const network = await getNetwork();
  const btcNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const psbt = new bitcoin.Psbt({ network: btcNetwork });

  // Add inputs
  const btcRpcUrl = await getBtcRpcUrl();
  await Promise.all(
    inputs.map(async (input) => {
      const txData = await fetch(`${btcRpcUrl}/tx/${input.txid}`).then((res) => res.json());

      const inputOptions = {
        hash: input.txid,
        index: input.vout,
        sequence: 0xfffffffd,
        witnessUtxo: {
          script: Buffer.from(txData.vout[input.vout].scriptpubkey, 'hex'),
          value: input.value,
        },
      };

      psbt.addInput(inputOptions);
    }),
  );

  // Add outputs
  outputs.forEach((output: { address: string; value: number }) => {
    psbt.addOutput({
      address: output.address,
      value: output.value,
    });
  });

  // Build contract call message
  const _inputs = inputs.map((item: { txid: string; vout: number; value: number }) => {
    return `${item.txid}:${item.vout}`;
  });

  const txOutputs = psbt.txOutputs.map((item: { script: Uint8Array; value: number }) => {
    return {
      script_pubkey: uint8ArrayToHex(item.script),
      value: item.value,
    };
  });

  const msg = {
    Withdraw: {
      target_btc_address: _btcAddress,
      input: _inputs,
      output: txOutputs,
    },
  };

  // Finally return the transaction object
  const transaction: Transaction = {
    receiverId: config.btcToken,
    signerId: _csna,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'ft_transfer_call',
          args: {
            receiver_id: config.bridgeContractId,
            amount: fromAmount?.toString(),
            msg: JSON.stringify(msg),
          },
          gas: '150000000000000', // 150 TGas
          deposit: '1', // 1 yoctoNEAR
        },
      },
    ],
  };

  console.log('=== End getWithdrawTransaction ===');
  return transaction;
}

interface CalculateWithdrawParams {
  amount: string | number;
  feeRate?: number;
  csna?: string;
  btcAddress?: string;
  env: ENV;
}
interface CalculateWithdrawResult {
  withdrawFee: number;
  gasFee?: number;
  inputs?: any[];
  outputs?: any[];
  fromAmount?: number;
  receiveAmount?: string;
  isError: boolean;
  errorMsg?: string;
}

export async function calculateWithdraw({
  amount,
  feeRate: _feeRate,
  csna: _csna,
  btcAddress: _btcAddress,
  env,
}: CalculateWithdrawParams): Promise<CalculateWithdrawResult> {
  try {
    const config = getWalletConfig(env);

    let btcAddress = _btcAddress || getBtcProvider().account;
    if (!btcAddress) {
      await getBtcProvider().autoConnect();
      btcAddress = getBtcProvider().account;
      if (!btcAddress) {
        throw new Error('BTC Account is not available.');
      }
    }
    const csna = _csna || (await getCsnaAccountId(env));

    const feeRate = _feeRate || (await getBtcGasPrice());
    // mock the gas limit
    const gasLimit = await calculateGasLimit({
      csna,
      transactions: [
        {
          signerId: '',
          receiverId: config.btcToken,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: 'ft_transfer_call',
                args: {
                  receiver_id: config.btcToken,
                  amount: '100',
                  msg: '',
                },
                gas: '30000000000000', // 30 TGas
                deposit: '1',
              },
            },
          ],
        },
      ],
      env,
    });

    let satoshis = Number(amount);
    if (Number(gasLimit) > 0) {
      satoshis = new Big(amount).minus(gasLimit).toNumber();
    }

    const brgConfig = await getBridgeConfig({ env });

    const { current_utxos_num } = await nearCallFunction<{ current_utxos_num: number }>(
      config.bridgeContractId,
      'get_metadata',
      {},
      { network: config.network },
    );

    const pageSize = 300;
    const totalPages = Math.ceil(current_utxos_num / pageSize);

    const utxoRequests = Array.from({ length: totalPages }, (_, index) => {
      const fromIndex = index * pageSize;
      const limit = Math.min(pageSize, current_utxos_num - fromIndex);
      return nearCallFunction<
        Record<
          string,
          {
            vout: number;
            balance: string;
            script: string;
          }
        >
      >(
        config.bridgeContractId,
        'get_utxos_paged',
        { from_index: fromIndex, limit },
        { network: config.network },
      );
    });

    const utxoResults = await Promise.all(utxoRequests);
    const allUTXO = utxoResults.reduce((acc, result) => ({ ...acc, ...result }), {});

    if (brgConfig.min_withdraw_amount) {
      if (Number(satoshis) < Number(brgConfig.min_withdraw_amount)) {
        return {
          withdrawFee: 0,
          isError: true,
          errorMsg: `Minimum withdraw amount is ${formatBtcAmount(Number(brgConfig.min_withdraw_amount) + Number(gasLimit))} BTC`,
        };
      }
    }

    const feePercent = Number(brgConfig.withdraw_bridge_fee.fee_rate) * Number(satoshis);
    const withdrawFee =
      feePercent > Number(brgConfig.withdraw_bridge_fee.fee_min)
        ? feePercent
        : Number(brgConfig.withdraw_bridge_fee.fee_min);

    const withdrawChangeAddress = brgConfig.change_address;

    const utxos = Object.keys(allUTXO)
      .map((key) => {
        const txid = key.split('@');
        return {
          txid: txid[0],
          vout: allUTXO[key].vout,
          value: Number(allUTXO[key].balance),
          script: allUTXO[key].script,
        };
      })
      .filter((utxo) => utxo.value > Number(brgConfig.min_change_amount));

    if (!utxos || utxos.length === 0) {
      return {
        withdrawFee,
        isError: true,
        errorMsg: 'The network is busy, please try again later.',
      };
    }

    const userSatoshis = Number(satoshis);
    const maxBtcFee = Number(brgConfig.max_btc_gas_fee);

    let { inputs, outputs, fee } = coinselect(
      utxos,
      [{ address: btcAddress, value: userSatoshis }],
      Math.ceil(feeRate),
    );

    if (inputs && inputs.length > 10) {
      const filteredUtxos = utxos.filter((utxo) => utxo.value >= userSatoshis);
      console.log('filteredUtxos', filteredUtxos);
      if (filteredUtxos.length > 0) {
        const result = coinselect(
          filteredUtxos,
          [{ address: btcAddress, value: userSatoshis }],
          Math.ceil(feeRate),
        );
        inputs = result.inputs;
        outputs = result.outputs;
        fee = result.fee;
      }
    }

    const newInputs = inputs;
    let newOutputs = outputs;
    let newFee = fee;

    if (!newOutputs || newOutputs.length === 0) {
      return {
        withdrawFee,
        isError: true,
        errorMsg: 'The network is busy, please try again later.',
      };
    }

    let userOutput, noUserOutput;
    for (let i = 0; i < newOutputs.length; i++) {
      const output = newOutputs[i];
      if (output.value.toString() === userSatoshis.toString()) {
        userOutput = output;
      } else {
        noUserOutput = output;
      }
      if (!output.address) {
        output.address = withdrawChangeAddress;
      }
    }

    let dis = 0;
    if (newFee > maxBtcFee) {
      dis = newFee - maxBtcFee;
      newFee = maxBtcFee;

      return {
        gasFee: newFee,
        withdrawFee,
        isError: true,
        errorMsg: 'Gas exceeds maximum value',
      };
    }

    userOutput.value = new Big(userOutput.value).minus(newFee).minus(withdrawFee).toNumber();

    if (userOutput.value < 0) {
      return {
        gasFee: newFee,
        withdrawFee,
        isError: true,
        errorMsg: 'Not enough gas',
      };
    }

    if (noUserOutput) {
      if (!noUserOutput.address) {
        noUserOutput.address = withdrawChangeAddress;
      }
      noUserOutput.value = new Big(noUserOutput.value)
        .plus(newFee)
        .plus(withdrawFee)
        .plus(dis)
        .toNumber();
    } else {
      noUserOutput = {
        address: withdrawChangeAddress,
        value: new Big(newFee).plus(withdrawFee).plus(dis).toNumber(),
      };
      newOutputs.push(noUserOutput);
    }

    let minValue = Math.min(...newInputs.map((input: any) => input.value));
    let totalNoUserOutputValue = noUserOutput.value;

    while (totalNoUserOutputValue >= minValue && minValue > 0 && newInputs.length > 0) {
      totalNoUserOutputValue -= minValue;
      noUserOutput.value = totalNoUserOutputValue;
      const minValueIndex = newInputs.findIndex((input: any) => input.value === minValue);
      if (minValueIndex > -1) {
        newInputs.splice(minValueIndex, 1);
      }
      minValue = Math.min(...newInputs.map((input: any) => input.value));
    }

    let gasMore = 0;
    if (noUserOutput.value === 0) {
      newOutputs = newOutputs.filter((item: any) => item.value !== 0);
    } else if (noUserOutput.value < Number(brgConfig.min_change_amount)) {
      gasMore = Number(brgConfig.min_change_amount) - noUserOutput.value;
      userOutput.value -= gasMore;
      noUserOutput.value = Number(brgConfig.min_change_amount);
    }

    const insufficientOutput = newOutputs.some((item: any) => item.value < 0);
    if (insufficientOutput) {
      return {
        gasFee: newFee,
        withdrawFee,
        isError: true,
        errorMsg: 'Not enough gas',
      };
    }

    // check if the output amount is below minimum change amount
    const belowMinChangeAmount = newOutputs.some(
      (item: any) => item.value > 0 && item.value < Number(brgConfig.min_change_amount),
    );
    if (belowMinChangeAmount) {
      // Calculate minimum withdraw amount: min_change_amount + gas + fee
      const minWithdrawAmount = new Big(brgConfig.min_withdraw_amount)
        .plus(brgConfig.min_change_amount)
        .plus(gasLimit)
        .plus(withdrawFee)
        .toNumber();

      return {
        gasFee: newFee,
        withdrawFee,
        isError: true,
        errorMsg: `Transaction amount too small. Minimum required: ${formatBtcAmount(minWithdrawAmount)} BTC`,
      };
    }

    const inputSum = newInputs.reduce((sum: number, cur: any) => sum + Number(cur.value), 0);
    const outputSum = newOutputs.reduce((sum: number, cur: any) => sum + Number(cur.value), 0);

    if (newFee + outputSum !== inputSum) {
      return {
        withdrawFee,
        isError: true,
        errorMsg: 'Service busy, please try again later',
      };
    }
    return {
      withdrawFee: new Big(withdrawFee).plus(gasLimit).plus(gasMore).toNumber(),
      gasFee: new Big(newFee).toNumber(),
      inputs: newInputs,
      outputs: newOutputs,
      fromAmount: satoshis,
      receiveAmount: userOutput.value,
      isError: false,
    };
  } catch (error: any) {
    return {
      withdrawFee: 0,
      isError: true,
      errorMsg: error.message,
    };
  }
}

// Helper function
function uint8ArrayToHex(uint8Array: Uint8Array): string {
  return Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
