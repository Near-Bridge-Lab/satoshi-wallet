import Big from 'big.js';
import type { ENV } from '../config';
import { walletConfig, btcRpcUrls } from '../config';
import { delay, retryOperation } from '../utils';
import { nearCallFunction, pollTransactionStatuses } from '../utils/nearUtils';
import { checkBridgeTransactionStatus, receiveDepositMsg } from '../utils/satoshi';
import { Dialog } from '../utils/Dialog';
import type { FinalExecutionOutcome } from '@near-wallet-selector/core';

const MINIMUM_DEPOSIT_AMOUNT = 5000;
const MINIMUM_DEPOSIT_AMOUNT_BASE = 1000;
const NEAR_STORAGE_DEPOSIT_AMOUNT = '1250000000000000000000';
const NBTC_STORAGE_DEPOSIT_AMOUNT = 3000;
const GAS_LIMIT = '50000000000000';

function getBtcProvider() {
  if (typeof window === 'undefined' || !window.btcContext) {
    throw new Error('BTC Provider is not initialized.');
  }
  return window.btcContext;
}

async function getNetwork() {
  const network = await getBtcProvider().getNetwork();
  console.log('btc network:', network);
  return network === 'livenet' ? 'mainnet' : 'testnet';
}

async function getBtcRpcUrl() {
  const network = await getNetwork();
  return btcRpcUrls[network as keyof typeof btcRpcUrls];
}

async function getConfig(env: ENV) {
  return walletConfig[env];
}

async function nearCall<T>(contractId: string, methodName: string, args: any) {
  const network = await getNetwork();
  return nearCallFunction<T>(contractId, methodName, args, { network });
}

export interface DebtInfo {
  gas_token_id: string;
  transfer_amount: string;
  near_gas_debt_amount: string;
  protocol_fee_debt_amount: string;
}

export async function getAccountInfo(csna: string, accountContractId: string) {
  const accountInfo = await nearCall<
    | {
        nonce: string;
        gas_token: Record<string, string>;
        debt_info?: DebtInfo;
      }
    | undefined
  >(accountContractId, 'get_account', { account_id: csna });
  console.log('get_account accountInfo:', accountInfo);
  return accountInfo;
}

export async function checkGasTokenBalance(
  csna: string,
  gasToken: string,
  minAmount: string,
  env: ENV,
) {
  const amount = await nearCall<string>(gasToken, 'ft_balance_of', { account_id: csna });
  console.log('gas token balance:', amount);
  if (new Big(amount).lt(minAmount)) {
    await Dialog.confirm({
      title: 'Gas token balance is insufficient',
      message: 'Please deposit gas token to continue, will open bridge website.',
    });
    const config = await getConfig(env);
    window.open(config.bridgeUrl, '_blank');
    throw new Error('Gas token balance is insufficient');
  }
}

type CheckGasTokenArrearsReturnType<T extends boolean> = T extends true
  ? void
  : { receiver_id: string; amount: string; msg: string } | undefined;

export async function checkGasTokenArrears<T extends boolean>(
  debtInfo: DebtInfo | undefined,
  env: ENV,
  autoDeposit?: T,
): Promise<CheckGasTokenArrearsReturnType<T>> {
  if (!debtInfo) return;
  const config = await getConfig(env);
  const transferAmount = debtInfo.transfer_amount;
  console.log('get_account debtInfo:', debtInfo);

  const action = {
    receiver_id: config.accountContractId,
    amount: transferAmount,
    msg: JSON.stringify('Deposit'),
  };

  if (!autoDeposit) return action as CheckGasTokenArrearsReturnType<T>;

  const confirmed = await Dialog.confirm({
    title: 'Has gas token arrears',
    message: 'You have gas token arrears, please deposit gas token to continue.',
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

export async function queryGasTokenArrears(env: ENV) {
  const config = await getConfig(env);
  const csna = await getCsnaAccountId(env);
  const accountInfo = await getAccountInfo(csna, config.accountContractId);
  return accountInfo?.debt_info;
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

export async function getBtcBalance() {
  const { account } = await retryOperation(getBtcProvider, (res) => !!res.account);

  if (!account) {
    console.error('BTC Account is not available.');
    return { rawBalance: 0, balance: 0, maxSpendableBalance: 0 };
  }

  const btcRpcUrl = await getBtcRpcUrl();
  const utxos = await fetch(`${btcRpcUrl}/address/${account}/utxo`).then((res) => res.json());

  const btcDecimals = 8;

  const rawBalance =
    utxos?.reduce((acc: number, cur: { value: number }) => acc + cur.value, 0) || 0;
  const balance = rawBalance / 10 ** btcDecimals;

  // get the recommended fee rate
  const feeRate = await getBtcGasPrice();

  // calculate the estimated transaction size (bytes)
  // input size = input count * 64 bytes (each input is about 64 bytes)
  // output size = 34 bytes (one output)
  // other fixed overhead = 10 bytes
  const inputSize = (utxos?.length || 0) * 66;
  const outputSize = 34;
  const overheadSize = 10;
  const estimatedTxSize = inputSize + outputSize + overheadSize;

  // calculate the estimated transaction fee
  const estimatedFee = estimatedTxSize * feeRate;
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

export async function sendBitcoin(
  address: string,
  amount: number,
  feeRate: number,
): Promise<string> {
  const { sendBitcoin } = getBtcProvider();
  const txHash = await sendBitcoin(address, amount, { feeRate });
  return txHash;
}

export async function estimateDepositAmount(
  amount: string,
  option?: {
    env?: ENV;
  },
) {
  const { receiveAmount } = await getDepositAmount(amount, { ...option, isEstimate: true });
  return receiveAmount;
}

export async function getDepositAmount(
  amount: string,
  option?: {
    isEstimate?: boolean;
    env?: ENV;
  },
) {
  const config = await getConfig(option?.env || 'mainnet');
  const {
    deposit_bridge_fee: { fee_min, fee_rate },
  } = await nearCall<{ deposit_bridge_fee: { fee_min: string; fee_rate: number } }>(
    config.bridgeContractId,
    'get_config',
    {},
  );
  const depositAmount = option?.isEstimate
    ? Number(amount)
    : Math.max(MINIMUM_DEPOSIT_AMOUNT + MINIMUM_DEPOSIT_AMOUNT_BASE, Number(amount));
  const fee = Math.max(Number(fee_min), Number(depositAmount) * fee_rate);
  const receiveAmount = new Big(depositAmount)
    .minus(fee)
    .minus(MINIMUM_DEPOSIT_AMOUNT_BASE)
    .round(0, Big.roundDown)
    .toNumber();
  console.log('getDepositAmount:', { depositAmount, receiveAmount, fee });
  return {
    depositAmount,
    receiveAmount: Math.max(receiveAmount, 0),
    fee,
  };
}

export async function getCsnaAccountId(env: ENV) {
  const config = await getConfig(env);
  const { getPublicKey } = getBtcProvider();
  const btcPublicKey = await getPublicKey();
  const csna = await nearCall<string>(
    config.accountContractId,
    'get_chain_signature_near_account_id',
    {
      btc_public_key: btcPublicKey,
    },
  );
  return csna;
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
  fixedAmount?: boolean;
  env?: ENV;
  pollResult?: T;
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
  fixedAmount = true,
  pollResult = true as T,
  registerDeposit,
  env = 'mainnet',
}: ExecuteBTCDepositAndActionParams<T>): Promise<ExecuteBTCDepositAndActionReturn<T>> {
  try {
    const { getPublicKey } = getBtcProvider();

    const config = await getConfig(env);

    const btcPublicKey = await getPublicKey();

    if (!btcPublicKey) {
      throw new Error('BTC Public Key is not available.');
    }
    if (!amount && !action) {
      throw new Error('amount or action is required');
    }

    const csna = await getCsnaAccountId(env);

    const rawDepositAmount = (action ? action.amount : amount) ?? '0';

    if (new Big(rawDepositAmount).lt(0)) {
      throw new Error('amount must be greater than 0');
    }

    const { depositAmount, receiveAmount } = await getDepositAmount(rawDepositAmount, {
      env,
    });

    const accountInfo = await getAccountInfo(csna, config.accountContractId);

    const newActions = [];

    const repayAction = await checkGasTokenArrears(accountInfo?.debt_info, env, false);

    if (repayAction) {
      newActions.push({
        ...repayAction,
        gas: GAS_LIMIT,
      });
    }

    // if action is not provided, and the gas token balance is less than the minimum deposit amount, then add the deposit action
    if (
      action ||
      (!action &&
        new Big(accountInfo?.gas_token[config.token] || 0).lt(MINIMUM_DEPOSIT_AMOUNT_BASE))
    ) {
      newActions.push(
        action
          ? {
              ...action,
              amount:
                repayAction?.amount && !fixedAmount
                  ? new Big(receiveAmount).minus(repayAction.amount).toString()
                  : receiveAmount.toString(),
              gas: GAS_LIMIT,
            }
          : {
              receiver_id: config.accountContractId,
              amount: MINIMUM_DEPOSIT_AMOUNT_BASE.toString(),
              msg: JSON.stringify('Deposit'),
              gas: GAS_LIMIT,
            },
      );
    }

    const storageDepositMsg: {
      storage_deposit_msg?: {
        contract_id: string;
        deposit: string;
        registration_only: boolean;
      };
      btc_public_key?: string;
    } = {};

    // check receiver_id is registered
    const registerRes = await nearCall<{
      available: string;
      total: string;
    }>(action?.receiver_id || config.token, 'storage_balance_of', {
      account_id: csna,
    });

    if (!registerRes?.available) {
      storageDepositMsg.storage_deposit_msg = {
        contract_id: action?.receiver_id || config.token,
        deposit: registerDeposit || NEAR_STORAGE_DEPOSIT_AMOUNT,
        registration_only: true,
      };
    }
    // check account is registerer
    if (!accountInfo?.nonce) {
      storageDepositMsg.btc_public_key = btcPublicKey;
      newActions.push({
        receiver_id: config.accountContractId,
        amount: NBTC_STORAGE_DEPOSIT_AMOUNT.toString(),
        msg: JSON.stringify('RelayerFee'),
        gas: GAS_LIMIT,
      });
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
    const sendAmount =
      repayAction?.amount && fixedAmount
        ? new Big(depositAmount).plus(repayAction?.amount || 0).toString()
        : depositAmount;

    console.log('user deposit address:', userDepositAddress);
    console.log('send amount:', sendAmount);
    console.log('fee rate:', _feeRate);

    const txHash = await sendBitcoin(userDepositAddress, Number(sendAmount), _feeRate);

    const postActionsStr = newActions.length > 0 ? JSON.stringify(newActions) : undefined;
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
