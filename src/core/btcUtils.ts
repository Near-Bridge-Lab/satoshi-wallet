import Big from 'big.js';
import type { ENV } from '../config';
import { getWalletConfig, btcRpcUrls } from '../config';
import { retryOperation } from '../utils';
import { nearCallFunction, pollTransactionStatuses } from '../utils/nearUtils';
import {
  calculateWithdraw,
  checkBridgeTransactionStatus,
  getAccountInfo,
  getBridgeConfig,
  getWhitelist,
  preReceiveDepositMsg,
  receiveDepositMsg,
  calculateGasLimit,
} from '../utils/satoshi';
import { Dialog } from '../utils/Dialog';
import type { FinalExecutionOutcome, Transaction } from '@near-wallet-selector/core';
import * as bitcoin from 'bitcoinjs-lib';
// @ts-ignore
import coinselect from 'coinselect';
// @ts-ignore
import * as ecc from '@bitcoinerlab/secp256k1';

export { calculateGasLimit, calculateWithdraw };

// init ecc lib
bitcoin.initEccLib(ecc);

/** NEAR Storage Deposit Amount */
const NEAR_STORAGE_DEPOSIT_AMOUNT = '1250000000000000000000';
/** NBTC Storage Deposit Amount */
const NBTC_STORAGE_DEPOSIT_AMOUNT = '3000';
/** New account min deposit amount */
const NEW_ACCOUNT_MIN_DEPOSIT_AMOUNT = '1000';

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

export async function checkGasTokenDebt<T extends boolean>(
  csna: string,
  env: ENV,
  autoDeposit?: T,
): Promise<CheckGasTokenDebtReturnType<T>> {
  const accountInfo = await getAccountInfo({ csna, env });
  const debtAmount = new Big(accountInfo?.debt_info?.near_gas_debt_amount || 0)
    .plus(accountInfo?.debt_info?.protocol_fee_debt_amount || 0)
    .toString();
  const relayerFeeAmount = !accountInfo?.nonce
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

  const confirmed = await Dialog.confirm({
    title: hasDebtArrears ? 'Has gas token arrears' : 'Has relayer fee arrears',
    message: hasDebtArrears
      ? 'You have gas token arrears, please deposit gas token to continue.'
      : 'You have relayer fee arrears, please deposit relayer fee to continue.',
  });

  if (confirmed) {
    await executeBTCDepositAndAction({ action, env });

    await Dialog.alert({
      title: 'Deposit success',
      message: 'Deposit success, will continue to execute transaction.',
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

export async function getBtcGasPrice(): Promise<number> {
  const network = await getNetwork();
  const defaultFeeRate = network === 'mainnet' ? 5 : 2500;
  try {
    const btcRpcUrl = await getBtcRpcUrl();
    const res = await fetch(`${btcRpcUrl}/v1/fees/recommended`).then((res) => res.json());
    const feeRate = res.fastestFee;
    return feeRate || defaultFeeRate;
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
  console.log('calculateGasFee fee:', fee);
  return fee;
}

export async function getBtcBalance(
  account?: string,
  option?: {
    env?: ENV;
  },
) {
  const env = option?.env || 'mainnet';
  let csna = '';
  if (!account) {
    const res = await retryOperation(getBtcProvider, (res) => !!res.account);

    if (!res.account) {
      console.error('BTC Account is not available.');
      return { rawBalance: 0, balance: 0, availableBalance: 0 };
    }
    account = res.account;
    csna = await getCsnaAccountId(env);
  }

  const utxos = await getBtcUtxos(account);

  const btcDecimals = 8;

  const rawBalance = utxos?.reduce((acc, cur) => acc + cur.value, 0) || 0;
  const balance = rawBalance / 10 ** btcDecimals;

  const estimatedFee = await calculateGasFee(account, rawBalance);

  let availableRawBalance = (rawBalance - estimatedFee).toFixed(0);

  if (csna) {
    const { protocolFee, repayAmount } = await getDepositAmount(rawBalance.toString(), {
      env,
      csna,
    });
    availableRawBalance = new Big(availableRawBalance)
      .minus(protocolFee)
      .minus(repayAmount)
      .toFixed(0);
  }

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

export async function sendBitcoin(
  address: string,
  amount: number,
  feeRate: number,
): Promise<string> {
  const { sendBitcoin } = getBtcProvider();
  const txHash = await sendBitcoin(address, amount, { feeRate });
  return txHash;
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
    env?: ENV;
    /** default is true, if true, new account minimum deposit amount 1000sat, otherwise 0 */
    newAccountMinDepositAmount?: boolean;
  },
) {
  const env = option?.env || 'mainnet';
  const _newAccountMinDepositAmount = option?.newAccountMinDepositAmount ?? true;
  const csna = option?.csna || (await getCsnaAccountId(env));
  const accountInfo = await getAccountInfo({ csna, env });
  const debtAction = await checkGasTokenDebt(csna, env, false);
  const repayAmount = debtAction?.amount || 0;
  const {
    deposit_bridge_fee: { fee_min, fee_rate },
    min_deposit_amount,
  } = await getBridgeConfig({ env });
  const depositAmount = Math.max(Number(min_deposit_amount), Number(amount));
  const protocolFee = Math.max(Number(fee_min), Number(depositAmount) * fee_rate);
  const newAccountMinDepositAmount =
    !accountInfo?.nonce && _newAccountMinDepositAmount ? NEW_ACCOUNT_MIN_DEPOSIT_AMOUNT : 0;
  const totalDepositAmount = new Big(depositAmount)
    .plus(protocolFee)
    .plus(repayAmount)
    .plus(newAccountMinDepositAmount)
    .round(0, Big.roundDown)
    .toNumber();

  return {
    depositAmount,
    totalDepositAmount,
    protocolFee,
    repayAmount,
    newAccountMinDepositAmount,
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

function checkDepositDisabledAddress() {
  const data = localStorage.getItem('btc-connect-xverse-addresses-Mainnet');
  if (!data) return;
  const addresses = JSON.parse(data);
  const address = addresses?.[0];
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
    console.log('executeBTCDepositAndAction start', amount);
    checkDepositDisabledAddress();
    const { getPublicKey } = getBtcProvider();

    const config = getWalletConfig(env);

    const btcPublicKey = await getPublicKey();

    if (!btcPublicKey) {
      throw new Error('BTC Public Key is not available.');
    }
    if (!amount && !action) {
      throw new Error('amount or action is required');
    }

    const csna = await getCsnaAccountId(env);

    const depositAmount = (action ? action.amount : amount) ?? '0';

    if (new Big(depositAmount).lt(0)) {
      throw new Error('amount must be greater than 0');
    }

    const { totalDepositAmount, protocolFee, repayAmount } = await getDepositAmount(depositAmount, {
      env,
      newAccountMinDepositAmount,
    });

    const accountInfo = await getAccountInfo({ csna, env });

    const newActions = [];

    const debtAction = await checkGasTokenDebt(csna, env, false);

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
      'Deposit Amount': depositAmount,
      'Protocol Fee': protocolFee,
      'Repay Amount': repayAmount,
      'Total Deposit Amount': totalDepositAmount,
      'Fee Rate': _feeRate,
    });

    const postActionsStr = newActions.length > 0 ? JSON.stringify(newActions) : undefined;

    await preReceiveDepositMsg(config.base_url, {
      btcPublicKey,
      depositType: postActionsStr || depositMsg.extra_msg ? 1 : 0,
      postActions: postActionsStr,
      extraMsg: depositMsg.extra_msg,
    });

    const txHash = await sendBitcoin(userDepositAddress, totalDepositAmount, _feeRate);

    await receiveDepositMsg(config.base_url, {
      btcPublicKey,
      txHash,
      depositType: postActionsStr || depositMsg.extra_msg ? 1 : 0,
      postActions: postActionsStr,
      extraMsg: depositMsg.extra_msg,
    });

    if (!pollResult) {
      return txHash as ExecuteBTCDepositAndActionReturn<T>;
    }

    const checkTransactionStatusRes = await checkBridgeTransactionStatus(config.base_url, txHash);
    console.log('checkBridgeTransactionStatus resp:', checkTransactionStatusRes);
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
  const hasShownNotice = localStorage.getItem('btc-wallet-private-mainnet-notice');
  if (!hasShownNotice) {
    Dialog.alert({
      title: 'Notice',
      message:
        'You are currently using Satoshi Private Mainnet. This is a private version for testing. Please try a small amount of assets in Ramp',
    });
    localStorage.setItem('btc-wallet-private-mainnet-notice', 'true');
  }
  if (!btcAccountId) return;
  const config = getWalletConfig(env);
  const whitelist = await getWhitelist(config.base_url);
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
          gas: '300000000000000', // 300 TGas
          deposit: '1', // 1 yoctoNEAR
        },
      },
    ],
  };

  console.log('=== End getWithdrawTransaction ===');
  return transaction;
}

// Helper function
function uint8ArrayToHex(uint8Array: Uint8Array): string {
  return Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
