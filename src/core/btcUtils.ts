import Big from 'big.js';
import { walletConfig, btcRpcUrls } from '../config';
import { delay, retryOperation } from '../utils';
import { nearCallFunction, pollTransactionStatuses } from '../utils/nearUtils';
import { checkBridgeTransactionStatus, receiveDepositMsg } from '../utils/satoshi';

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

interface DepositMsg {
  recipient_id: string;
  post_actions: Array<{
    receiver_id: string;
    amount: string;
    memo?: string;
    msg: string;
    gas?: string;
  }>;
  extra_msg?: string;
}

export async function getBtcGasPrice(): Promise<number> {
  const defaultFeeRate = 100;
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

export async function estimateDepositAmount(
  amount: string,
  option?: {
    isDev: boolean;
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
  const fee = Math.max(Number(fee_min), Number(amount) * fee_rate);
  return new Big(amount).minus(fee).toFixed(0);
}

interface ExecuteBTCDepositAndActionParams {
  action: {
    receiver_id: string;
    amount: string;
    // memo?: string;
    msg: string;
  };
  /** fee rate, if not provided, will use the recommended fee rate from the btc node */
  feeRate?: number;
  /** is dev environment */
  isDev?: boolean;
}

export async function executeBTCDepositAndAction({
  action,
  feeRate,
  isDev = false,
}: ExecuteBTCDepositAndActionParams) {
  try {
    const { getPublicKey } = getBtcProvider();

    const config = await getConfig(isDev);

    const btcPublicKey = await getPublicKey();

    if (!btcPublicKey) {
      throw new Error('BTC Public Key is not available.');
    }
    if (!action.receiver_id) {
      throw new Error('receiver_id is required');
    }

    if (!action.amount) {
      throw new Error('amount is required');
    }

    const csna = await nearCall<string>(
      config.accountContractId,
      'get_chain_signature_near_account_id',
      {
        btc_public_key: btcPublicKey,
      },
    );

    const depositMsg: DepositMsg = {
      recipient_id: csna,
      post_actions: [
        {
          ...action,
          gas: new Big(100).mul(10 ** 12).toFixed(0),
        },
      ],
    };
    const storageDepositMsg: {
      storage_deposit_msg?: {
        contract_id: string;
        deposit: string;
        registration_only: boolean;
      };
      btc_public_key?: string;
    } = {};

    // check account is registered
    const accountInfo = await nearCall<{ nonce: string } | undefined>(
      config.accountContractId,
      'get_account',
      {
        account_id: csna,
      },
    );
    if (!accountInfo?.nonce) {
      storageDepositMsg.btc_public_key = btcPublicKey;
    }

    // check receiver_id is registered
    const registerRes = await nearCall<{
      available: string;
      total: string;
    }>(action.receiver_id, 'storage_balance_of', {
      account_id: csna,
    });

    if (!registerRes?.available) {
      storageDepositMsg.storage_deposit_msg = {
        contract_id: action.receiver_id,
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
    const minDepositAmount = 5000;
    const sendAmount = Math.max(minDepositAmount, new Big(action.amount).toNumber());
    console.log('user deposit address:', userDepositAddress);
    console.log('send amount:', sendAmount);
    console.log('fee rate:', _feeRate);

    const txHash = await sendBitcoin(userDepositAddress, sendAmount, _feeRate);
    await receiveDepositMsg(config.base_url, {
      btcPublicKey,
      txHash,
      postActions: JSON.stringify(depositMsg.post_actions),
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
