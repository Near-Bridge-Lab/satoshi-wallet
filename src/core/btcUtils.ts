import Big from 'big.js';
import type { ENV } from '../config';
import { getWalletConfig, btcRpcUrls } from '../config';
import { retryOperation } from '../utils';
import { nearCallFunction, pollTransactionStatuses } from '../utils/nearUtils';
import {
  calculateGasLimit,
  checkBridgeTransactionStatus,
  getAccountInfo,
  getWhitelist,
  preReceiveDepositMsg,
  receiveDepositMsg,
} from '../utils/satoshi';
import { Dialog } from '../utils/Dialog';
import type { FinalExecutionOutcome, Transaction } from '@near-wallet-selector/core';
import bitcoin from 'bitcoinjs-lib';
// @ts-ignore
import * as ecc from '@bitcoinerlab/secp256k1';
// @ts-ignore
import coinselect from 'coinselect';

// init ecc lib
bitcoin.initEccLib(ecc);

/** NEAR Storage Deposit Amount */
const NEAR_STORAGE_DEPOSIT_AMOUNT = '1250000000000000000000';
/** NBTC Storage Deposit Amount */
const NBTC_STORAGE_DEPOSIT_AMOUNT = '3000';
/** NEAR Gas Limit */
const GAS_LIMIT = '50000000000000';
/** New account min deposit amount */
const NEW_ACCOUNT_MIN_DEPOSIT_AMOUNT = '1000';

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

export async function getBtcBalance() {
  const { account } = await retryOperation(getBtcProvider, (res) => !!res.account);

  if (!account) {
    console.error('BTC Account is not available.');
    return { rawBalance: 0, balance: 0, availableBalance: 0 };
  }

  const btcRpcUrl = await getBtcRpcUrl();
  const utxos = await fetch(`${btcRpcUrl}/address/${account}/utxo`).then((res) => res.json());

  const btcDecimals = 8;

  const rawBalance: number =
    utxos?.reduce((acc: number, cur: { value: number }) => acc + cur.value, 0) || 0;
  const balance = rawBalance / 10 ** btcDecimals;

  // get the recommended fee rate
  const feeRate = await getBtcGasPrice();

  // P2WPKH input vsize ≈ 69 vbytes
  const inputSize = (utxos?.length || 0) * 69;
  const outputSize = 33 * 2;
  const overheadSize = 11;
  const estimatedTxSize = inputSize + outputSize + overheadSize;

  const estimatedFee = Math.ceil(estimatedTxSize * feeRate);
  console.log('estimatedFee:', estimatedFee);
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
    /** default is true, if true, new account minimum deposit amount 1000sat, otherwise 0 */
    newAccountMinDepositAmount?: boolean;
  },
) {
  const env = option?.env || 'mainnet';
  const _newAccountMinDepositAmount = option?.newAccountMinDepositAmount ?? true;
  const config = getWalletConfig(env);
  const csna = await getCsnaAccountId(env);
  const accountInfo = await getAccountInfo({ csna, env });
  const debtAction = await checkGasTokenDebt(csna, env, false);
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

    const registerContractId = (action?.receiver_id || config.btcToken).replace(
      config.accountContractId,
      config.btcToken,
    );
    console.log('executeBTCDepositAndAction registerContractId', registerContractId);
    // check receiver_id is registered
    const registerRes = await nearCall<{
      available: string;
      total: string;
    }>(registerContractId, 'storage_balance_of', {
      account_id: csna,
    });

    if (!registerRes?.available) {
      storageDepositMsg.storage_deposit_msg = {
        contract_id: registerContractId,
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
  env?: ENV;
}

export async function getWithdrawTransaction({
  amount,
  feeRate,
  env = 'mainnet',
}: WithdrawParams): Promise<Transaction> {
  console.log('=== Start getWithdrawTransaction ===');

  const provider = getBtcProvider();
  const btcAddress = provider.account;

  const config = getWalletConfig(env);

  const csna = await getCsnaAccountId(env);

  // Get configuration
  const brgConfig = await nearCall<{
    min_withdraw_amount: string;
    withdraw_bridge_fee: {
      fee_rate: number;
      fee_min: string;
    };
    max_btc_gas_fee: string;
    change_address: string;
    min_change_amount: string;
  }>(config.bridgeContractId, 'get_config', {});

  // Check minimum withdrawal amount
  if (brgConfig.min_withdraw_amount) {
    if (Number(amount) < Number(brgConfig.min_withdraw_amount)) {
      throw new Error('Mini withdraw amount is ' + brgConfig.min_withdraw_amount);
    }
  }

  // Calculate withdrawal fee
  const feePercent = Number(brgConfig.withdraw_bridge_fee.fee_rate) * Number(amount);
  const withdrawFee =
    feePercent > Number(brgConfig.withdraw_bridge_fee.fee_min)
      ? feePercent
      : Number(brgConfig.withdraw_bridge_fee.fee_min);
  console.log('Withdrawal Fee:', {
    feePercent,
    withdrawFee,
    minFee: brgConfig.withdraw_bridge_fee.fee_min,
  });

  // calculate gas limit mock transaction
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
              gas: '300000000000000',
              deposit: '1',
            },
          },
        ],
      },
    ],
    env,
  });
  const finalAmount = Number(gasLimit) > 0 ? Number(amount) - Number(gasLimit) : Number(amount);

  // Get UTXOs
  const allUTXO = await nearCall<
    Record<
      string,
      {
        vout: number;
        balance: string;
        script: string;
      }
    >
  >(config.bridgeContractId, 'get_utxos_paged', {});
  console.log('All UTXOs:', allUTXO);

  if (!allUTXO || Object.keys(allUTXO).length === 0) {
    throw new Error('The network is busy, please try again later.');
  }

  // Format UTXOs
  const utxos = Object.keys(allUTXO).map((key) => {
    const txid = key.split('@');
    return {
      txid: txid[0],
      vout: allUTXO[key].vout,
      value: Number(allUTXO[key].balance),
      script: allUTXO[key].script,
    };
  });
  console.log('Formatted UTXOs:', utxos);

  const _feeRate = feeRate || (await getBtcGasPrice());
  console.log('Fee Rate:', _feeRate);

  // Use coinselect to calculate inputs and outputs
  const coinSelectResult = coinselect(
    utxos,
    [{ address: btcAddress, value: Number(finalAmount) }],
    Math.ceil(_feeRate),
  );
  console.log('Coinselect Result:', coinSelectResult);

  const { inputs, outputs, fee } = coinSelectResult;

  if (!outputs || !inputs) {
    throw new Error('The network is busy, please try again later.');
  }

  // Process outputs
  const maxBtcFee = Number(brgConfig.max_btc_gas_fee);
  const transactionFee = fee;
  console.log('Transaction Fee:', { transactionFee, maxBtcFee });

  if (transactionFee > maxBtcFee) {
    throw new Error('Gas exceeds maximum value');
  }

  // Process output amounts
  let recipientOutput, changeOutput;
  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    if (output.value.toString() === finalAmount.toString()) {
      recipientOutput = output;
    } else {
      changeOutput = output;
    }
    if (!output.address) {
      output.address = brgConfig.change_address;
    }
  }
  console.log('Initial Outputs:', { recipientOutput, changeOutput });

  // Deduct fees from recipient output
  recipientOutput.value = new Big(recipientOutput.value)
    .minus(transactionFee)
    .minus(withdrawFee)
    .toNumber();

  if (changeOutput) {
    changeOutput.value = new Big(changeOutput.value)
      .plus(transactionFee)
      .plus(withdrawFee)
      .toNumber();

    // Handle minimum input value logic
    const remainingInputs = [...inputs];
    let smallestInput = Math.min.apply(
      null,
      remainingInputs.map((input) => input.value),
    );
    let remainingChangeAmount = changeOutput.value;
    console.log('Initial Change Processing:', { smallestInput, remainingChangeAmount });

    while (
      remainingChangeAmount >= smallestInput &&
      smallestInput > 0 &&
      remainingInputs.length > 0
    ) {
      remainingChangeAmount -= smallestInput;
      changeOutput.value = remainingChangeAmount;
      const smallestInputIndex = remainingInputs.findIndex(
        (input) => input.value === smallestInput,
      );
      if (smallestInputIndex > -1) {
        remainingInputs.splice(smallestInputIndex, 1);
      }
      smallestInput = Math.min.apply(
        null,
        remainingInputs.map((input) => input.value),
      );
      console.log('Change Processing Loop:', {
        remainingChangeAmount,
        smallestInput,
        remainingInputsCount: remainingInputs.length,
      });
    }

    // Handle minimum change amount logic
    const minChangeAmount = Number(brgConfig.min_change_amount);
    let additionalFee = 0;
    console.log('Checking minimum change amount:', {
      changeValue: changeOutput.value,
      minChangeAmount,
    });

    let finalOutputs = [...outputs];
    if (changeOutput.value === 0) {
      finalOutputs = finalOutputs.filter((output) => output.value !== 0);
      console.log('Removed zero-value change output', finalOutputs);
    } else if (changeOutput.value < minChangeAmount) {
      additionalFee = minChangeAmount - changeOutput.value;
      recipientOutput.value -= additionalFee;
      changeOutput.value = minChangeAmount;
      console.log('Adjusted for minimum change amount:', {
        additionalFee,
        newRecipientValue: recipientOutput.value,
        newChangeValue: changeOutput.value,
      });
    }
  } else {
    changeOutput = {
      address: brgConfig.change_address,
      value: new Big(transactionFee).plus(withdrawFee).toNumber(),
    };
    outputs.push(changeOutput);
    console.log('Created new change output:', changeOutput);
  }

  // Validate outputs
  const insufficientOutput = outputs.some((item: any) => item.value < 0);
  if (insufficientOutput) {
    console.error('Negative output value detected');
    throw new Error('Not enough gas');
  }

  // Verify input/output balance
  const inputSum = inputs.reduce((sum: number, cur: any) => sum + Number(cur.value), 0);
  const outputSum = outputs.reduce((sum: number, cur: any) => sum + Number(cur.value), 0);
  console.log('Balance verification:', { inputSum, outputSum, transactionFee });

  if (transactionFee + outputSum !== inputSum) {
    console.error('Balance mismatch:', { inputSum, outputSum, transactionFee });
    throw new Error('compute error');
  }

  // Build PSBT transaction
  const network = await getNetwork();
  const btcNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const psbt = new bitcoin.Psbt({ network: btcNetwork });

  // Add inputs
  const btcRpcUrl = await getBtcRpcUrl();
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
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
  }

  // Add outputs
  outputs.forEach((output: { address: string; value: any }) => {
    psbt.addOutput({
      address: output.address,
      value: output.value,
    });
  });

  console.log('outputs:', JSON.stringify(outputs));

  // Build contract call message
  const _inputs = inputs.map((item: any) => {
    return `${item.txid}:${item.vout}`;
  });

  const txOutputs = psbt.txOutputs.map((item: any) => {
    return {
      script_pubkey: uint8ArrayToHex(item.script),
      value: item.value,
    };
  });

  const msg = {
    Withdraw: {
      target_btc_address: btcAddress,
      input: _inputs,
      output: txOutputs,
    },
  };

  // Finally return the transaction object
  const transaction: Transaction = {
    receiverId: config.btcToken,
    signerId: csna,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'ft_transfer_call',
          args: {
            receiver_id: config.bridgeContractId,
            amount: amount.toString(),
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
