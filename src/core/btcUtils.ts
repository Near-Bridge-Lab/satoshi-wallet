import Big from 'big.js';
import type { ENV } from '../config';
import { walletConfig, btcRpcUrls } from '../config';
import { delay, retryOperation } from '../utils';
import { nearCallFunction, pollTransactionStatuses } from '../utils/nearUtils';
import {
  checkBridgeTransactionStatus,
  getWhitelist,
  preReceiveDepositMsg,
  receiveDepositMsg,
} from '../utils/satoshi';
import { Dialog } from '../utils/Dialog';
import type { FinalExecutionOutcome, Transaction } from '@near-wallet-selector/core';
import bitcoin from 'bitcoinjs-lib';
// @ts-ignore
import coinselect from 'coinselect';

const NEAR_STORAGE_DEPOSIT_AMOUNT = '1250000000000000000000';
const NBTC_STORAGE_DEPOSIT_AMOUNT = '3000';
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

export interface AccountInfo {
  nonce: string;
  gas_token: Record<string, string>;
  debt_info?: {
    gas_token_id: string;
    near_gas_debt_amount: string;
    protocol_fee_debt_amount: string;
  };
  relayer_fee?: { amount?: string };
}

export async function getAccountInfo(csna: string, accountContractId: string) {
  const accountInfo = await nearCall<AccountInfo>(accountContractId, 'get_account', {
    account_id: csna,
  }).catch((error) => {
    return undefined;
  });
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

type CheckGasTokenDebtParams<T extends boolean> = {
  accountInfo: AccountInfo | undefined;
  env: ENV;
  autoDeposit?: T;
};
type CheckGasTokenDebtReturnType<T extends boolean> = T extends true
  ? void
  : { receiver_id: string; amount: string; msg: string } | undefined;

export async function checkGasTokenDebt<T extends boolean>(
  accountInfo: AccountInfo | undefined,
  env: ENV,
  autoDeposit?: T,
): Promise<CheckGasTokenDebtReturnType<T>> {
  const debtAmount = new Big(accountInfo?.debt_info?.near_gas_debt_amount || 0)
    .plus(accountInfo?.debt_info?.protocol_fee_debt_amount || 0)
    .toString();
  const relayerFeeAmount = !accountInfo?.nonce
    ? NBTC_STORAGE_DEPOSIT_AMOUNT
    : accountInfo?.relayer_fee?.amount || 0;
  const hasDebtArrears = new Big(debtAmount).gt(0);
  const hasRelayerFeeArrears = new Big(relayerFeeAmount).gt(0);
  if (!hasDebtArrears && !hasRelayerFeeArrears) return;
  const config = await getConfig(env);
  const transferAmount = hasDebtArrears ? debtAmount : relayerFeeAmount;
  console.log('get_account:', accountInfo);

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

export async function getNBTCBalance(address: string, env?: ENV) {
  const config = await getConfig(env || 'mainnet');
  const rawBalance = await nearCall<string>(config.token, 'ft_balance_of', {
    account_id: address,
  });
  const balance = new Big(rawBalance)
    .div(10 ** 8)
    .round(8, Big.roundDown)
    .toNumber();
  const rawAvailableBalance = new Big(rawBalance).minus(1000).toNumber();
  const availableBalance = new Big(rawAvailableBalance)
    .div(10 ** 8)
    .round(8, Big.roundDown)
    .toNumber();
  return { balance, availableBalance, rawBalance, rawAvailableBalance };
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
    env?: ENV;
  },
) {
  const env = option?.env || 'mainnet';
  const config = await getConfig(env);
  const csna = await getCsnaAccountId(env);
  const accountInfo = await getAccountInfo(csna, config.accountContractId);
  const debtAction = await checkGasTokenDebt(accountInfo, env, false);
  const repayAmount = debtAction?.amount || 0;
  const {
    deposit_bridge_fee: { fee_min, fee_rate },
    min_deposit_amount,
  } = await nearCall<{
    deposit_bridge_fee: { fee_min: string; fee_rate: number };
    min_deposit_amount: string;
  }>(config.bridgeContractId, 'get_config', {});
  const depositAmount = Math.max(Number(min_deposit_amount), Number(amount));
  const protocolFee = Math.max(Number(fee_min), Number(depositAmount) * fee_rate);
  const totalDepositAmount = new Big(depositAmount)
    .plus(protocolFee)
    .plus(repayAmount)
    .round(0, Big.roundDown)
    .toNumber();

  return {
    depositAmount,
    totalDepositAmount,
    protocolFee,
    repayAmount,
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

    const depositAmount = (action ? action.amount : amount) ?? '0';

    if (new Big(depositAmount).lt(0)) {
      throw new Error('amount must be greater than 0');
    }

    const { totalDepositAmount, protocolFee, repayAmount } = await getDepositAmount(depositAmount, {
      env,
    });

    const accountInfo = await getAccountInfo(csna, config.accountContractId);

    const newActions = [];

    const debtAction = await checkGasTokenDebt(accountInfo, env, false);

    if (debtAction) {
      newActions.push({
        ...debtAction,
        gas: GAS_LIMIT,
      });
    }

    // if action is not provided, and the gas token balance is less than the minimum deposit amount, then add the deposit action
    if (action) {
      newActions.push({
        ...action,
        gas: GAS_LIMIT,
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
  if (env !== 'private_mainnet') return;
  if (!btcAccountId) return;
  const config = await getConfig(env);
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

export async function getWithdrawTransaction(amount: string, env: ENV = 'mainnet') {
  try {
    console.log('getWithdrawTransaction amount:', amount);
    const config = await getConfig(env);
    const btcProvider = getBtcProvider();
    const csna = await getCsnaAccountId(env);

    const btcAddress = await btcProvider.account;

    // Check gas token arrears
    const accountInfo = await getAccountInfo(csna, config.accountContractId);
    await checkGasTokenDebt(accountInfo, env, true);

    // Build withdrawal message
    const msg = {
      WithdrawByPsbt: {
        target_btc_address: btcAddress,
        psbt_hex: await createWithdrawPsbt(btcAddress, amount),
      },
    };

    console.log('getWithdrawTransaction msg:', msg);

    // Return withdrawal transaction
    const transaction: Transaction = {
      receiverId: config.bridgeContractId,
      signerId: csna,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'ft_transfer_call',
            args: {
              receiver_id: config.bridgeContractId,
              amount,
              msg: JSON.stringify(msg),
            },
            gas: GAS_LIMIT,
            deposit: '1',
          },
        },
      ],
    };
    console.log('getWithdrawTransaction transaction:', transaction);
    return transaction;
  } catch (error) {
    console.error('getWithdrawTransaction failed:', error);
    throw error;
  }
}

async function createWithdrawPsbt(btcAddress: string, amount: string): Promise<string> {
  const network = await getNetwork();
  const config = await getConfig(network === 'mainnet' ? 'mainnet' : 'testnet');

  // Get UTXO and metadata
  const allUTXO = await nearCall<any>(config.bridgeContractId, 'get_utxos_paged', {});
  const metaData = await nearCall<any>(config.bridgeContractId, 'get_metadata', {});

  console.log('getWithdrawPsbt allUTXO:', allUTXO);

  console.log('getWithdrawPsbt metaData:', metaData);

  const withdrawFee = Number(metaData.bridge_fee.FixFee.withdraw_fee);
  const withdrawChangeAddress = metaData.change_address;
  const maxBtcFee = Number(metaData.max_btc_gas_fee);

  // Convert UTXO format
  const utxos = Object.keys(allUTXO).map((key) => {
    const txid = key.split('@');
    return {
      txid: txid[0],
      vout: allUTXO[key].vout,
      value: Number(allUTXO[key].balance),
      script: allUTXO[key].script,
    };
  });

  if (!utxos || utxos.length === 0) {
    throw new Error('The network is busy, please try again later.');
  }

  const userSatoshis = Number(amount);
  const feeRate = await getBtcGasPrice();

  // Calculate inputs and outputs using coinselect
  let {
    inputs,
    outputs,
    fee,
  }: {
    inputs: { txid: string; vout: number; value: number }[];
    outputs: { address: string; value: number }[];
    fee: number;
  } = coinselect(utxos, [{ address: btcAddress, value: userSatoshis }], Math.ceil(feeRate));

  // If first calculation fails, retry with 0 fee rate
  let compute2 = false;
  if (!outputs || !inputs) {
    const result = coinselect(utxos, [{ address: btcAddress, value: userSatoshis }], Math.ceil(0));
    inputs = result.inputs;
    outputs = result.outputs;
    fee = result.fee;
    compute2 = true;
  }

  if (!outputs || outputs.length === 0) {
    throw new Error('The network is busy, please try again later.');
  }

  // Handle fees and outputs
  let userOutput: { address: string; value: number } | undefined;
  let noUserOutput: { address: string; value: number } | undefined;
  for (const output of outputs) {
    if (output.value.toString() === userSatoshis.toString()) {
      userOutput = output;
    } else {
      noUserOutput = output;
    }
    if (!output.address) {
      output.address = withdrawChangeAddress;
    }
  }

  if (compute2) {
    fee = maxBtcFee;
    if (userOutput && userOutput.value < maxBtcFee) {
      throw new Error('Not enough gas');
    }
  }

  if (fee > maxBtcFee) {
    throw new Error('Gas exceeds maximum value');
  }

  // Adjust output amounts
  if (userOutput) {
    userOutput.value = new Big(userOutput.value).minus(fee).minus(withdrawFee).toNumber();
  }
  if (noUserOutput) {
    if (!noUserOutput.address) {
      noUserOutput.address = withdrawChangeAddress;
    }
    if (!compute2) {
      noUserOutput.value = new Big(noUserOutput.value).plus(fee).plus(withdrawFee).toNumber();
    } else {
      noUserOutput.value = new Big(noUserOutput.value).plus(withdrawFee).toNumber();
    }
  } else {
    if (!compute2) {
      outputs.push({
        address: withdrawChangeAddress,
        value: new Big(fee).plus(withdrawFee).toNumber(),
      });
    } else {
      outputs.push({
        address: withdrawChangeAddress,
        value: new Big(withdrawFee).toNumber(),
      });
    }
  }

  // Verify output amounts
  if (outputs.some((item) => item.value < 0)) {
    throw new Error('Not enough gas');
  }

  // Verify input/output balance
  const inputSum = inputs.reduce((sum, cur) => sum + Number(cur.value), 0);
  const outputSum = outputs.reduce((sum, cur) => sum + Number(cur.value), 0);
  if (fee + outputSum !== inputSum) {
    throw new Error('Compute error');
  }

  // Build PSBT
  const psbt = new bitcoin.Psbt({
    network: bitcoin.networks[network === 'mainnet' ? 'bitcoin' : 'testnet'],
  });

  // Add inputs
  const btcRpcUrl = await getBtcRpcUrl();
  for (const input of inputs) {
    const txData = await fetch(`${btcRpcUrl}/tx/${input.txid}`).then((res) => res.json());

    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      sequence: 0xfffffffd,
      // @ts-ignore
      witnessUtxo: {
        script: Buffer.from(txData.vout[input.vout].scriptpubkey, 'hex'),
        value: input.value,
      },
    });
  }

  // Add outputs
  outputs.forEach((output) => {
    psbt.addOutput({
      address: output.address,
      value: output.value,
    });
  });

  return psbt.toHex();
}
