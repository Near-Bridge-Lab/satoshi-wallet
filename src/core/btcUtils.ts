import Big from 'big.js';
import { walletConfig, btcRpcUrls } from '../config';
import { delay, retryOperation } from '../utils';
import { nearCallFunction, pollTransactionStatuses } from '../utils/nearUtils';
import { checkBridgeTransactionStatus, receiveDepositMsg } from '../utils/satoshi';
import { Dialog } from '../utils/Dialog';

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

async function getConfig(isDev: boolean) {
  const network = await getNetwork();
  return walletConfig[isDev ? 'dev' : network];
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
  const accountInfo = await nearCall<{
    nonce: string;
    gas_token: Record<string, string>;
    debt_info: DebtInfo;
  }>(accountContractId, 'get_account', { account_id: csna });
  return accountInfo;
}

type CheckGasTokenArrearsReturnType<T extends boolean> = T extends true
  ? void
  : { receiver_id: string; amount: string; msg: string } | undefined;

export async function checkGasTokenArrears<T extends boolean>(
  debtInfo: DebtInfo | undefined,
  isDev: boolean,
  autoDeposit?: T,
): Promise<CheckGasTokenArrearsReturnType<T>> {
  if (!debtInfo) return;
  const config = await getConfig(isDev);
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
    await executeBTCDepositAndAction({ action, isDev });

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

export async function getBtcBalance() {
  const { account } = await retryOperation(getBtcProvider, (res) => !!res.account);

  if (!account) {
    console.error('BTC Account is not available.');
    return { rawBalance: 0, balance: 0, maxSpendableBalance: 0 };
  }

  const btcRpcUrl = await getBtcRpcUrl();
  const utxos = await fetch(`${btcRpcUrl}/address/${account}/utxo`).then((res) => res.json());

  const rawBalance = utxos?.reduce((acc: number, cur: any) => acc + cur.value, 0) || 0;
  const balance = rawBalance / 10 ** 8;

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
  const estimatedFee = (estimatedTxSize * feeRate) / 10 ** 8;
  console.log('estimated fee:', estimatedFee);

  // available balance = total balance - estimated transaction fee
  const availableBalance = Math.max(0, balance - estimatedFee);

  return {
    rawBalance,
    balance,
    availableBalance,
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

const MINIMUM_DEPOSIT_AMOUNT = 5000;
const MINIMUM_DEPOSIT_AMOUNT_BASE = 1000;

export async function estimateDepositAmount(
  amount: string,
  option?: {
    isDev?: boolean;
  },
) {
  const { receiveAmount } = await getDepositAmount(amount, { ...option, isEstimate: true });
  return receiveAmount;
}

export async function getDepositAmount(
  amount: string,
  option?: {
    isEstimate?: boolean;
    isDev?: boolean;
  },
) {
  const config = await getConfig(option?.isDev || false);
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
  const receiveAmount = new Big(depositAmount).minus(fee).round(0, Big.roundDown).toNumber();
  return {
    depositAmount,
    receiveAmount: Math.max(receiveAmount, 0),
    fee,
  };
}

interface ExecuteBTCDepositAndActionParams {
  action?: {
    receiver_id: string;
    amount: string;
    // memo?: string;
    msg: string;
  };
  amount?: string;
  /** fee rate, if not provided, will use the recommended fee rate from the btc node */
  feeRate?: number;
  /** fixed amount, if true, in arrears mode, amount is fixed, otherwise it is depositAmount-repayAction.amount */
  fixedAmount?: boolean;
  /** is dev environment */
  isDev?: boolean;
}

export async function executeBTCDepositAndAction({
  action,
  amount,
  feeRate,
  fixedAmount = true,
  isDev = false,
}: ExecuteBTCDepositAndActionParams) {
  try {
    const { getPublicKey } = getBtcProvider();

    const config = await getConfig(isDev);

    const btcPublicKey = await getPublicKey();

    if (!btcPublicKey) {
      throw new Error('BTC Public Key is not available.');
    }
    if (!amount && !action) {
      throw new Error('amount or action is required');
    }

    const csna = await nearCall<string>(
      config.accountContractId,
      'get_chain_signature_near_account_id',
      {
        btc_public_key: btcPublicKey,
      },
    );

    const rawDepositAmount = (action ? action.amount : amount) ?? '0';

    if (new Big(rawDepositAmount).lt(0)) {
      throw new Error('amount must be greater than 0');
    }

    const { depositAmount, receiveAmount } = await getDepositAmount(rawDepositAmount, {
      isDev,
    });

    const accountInfo = await getAccountInfo(csna, config.accountContractId);

    const newActions = [];

    const gasLimit = new Big(50).mul(10 ** 12).toFixed(0);

    const repayAction = await checkGasTokenArrears(accountInfo.debt_info, isDev, false);

    if (repayAction) {
      newActions.push({
        ...repayAction,
        gas: gasLimit,
      });
    }

    if (action) {
      newActions.push({
        ...action,
        amount:
          repayAction?.amount && !fixedAmount
            ? new Big(receiveAmount).minus(repayAction.amount).toString()
            : receiveAmount.toString(),
        gas: gasLimit,
      });
    }

    const depositMsg: DepositMsg = {
      recipient_id: csna,
      post_actions: newActions.length > 0 ? newActions : undefined,
    };

    const storageDepositMsg: {
      storage_deposit_msg?: {
        contract_id: string;
        deposit: string;
        registration_only: boolean;
      };
      btc_public_key?: string;
    } = {};

    // check account is registerer

    if (!accountInfo?.nonce) {
      storageDepositMsg.btc_public_key = btcPublicKey;
    }

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
        deposit: new Big(0.25).mul(10 ** 24).toFixed(0),
        registration_only: true,
      };
    }
    if (Object.keys(storageDepositMsg).length > 0) {
      depositMsg.extra_msg = JSON.stringify(storageDepositMsg);
    }
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
    const checkTransactionStatusRes = await checkBridgeTransactionStatus(config.base_url, txHash);
    console.log('checkBridgeTransactionStatus resp:', checkTransactionStatusRes);
    const network = await getNetwork();
    const result = await pollTransactionStatuses(network, [checkTransactionStatusRes.ToTxHash]);
    return result;
  } catch (error: any) {
    console.error('executeBTCDepositAndAction error:', error);
    throw error;
  }
}
