import Big from 'big.js';
import { walletConfig, btcRpcUrls } from '../config';
import request from '../utils/request';
import { retryOperation } from '../utils';
import { nearCallFunction } from '../utils/nearUtils';

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

async function receiveDepositMsg(
  baseUrl: string,
  {
    btcPublicKey,
    txHash,
    depositType = 1,
    postActions,
    extraMsg,
  }: {
    btcPublicKey: string;
    txHash: string;
    depositType?: number;
    postActions: string;
    extraMsg: string;
  },
) {
  const res = await request(`${baseUrl}/v1/receiveDepositMsg`, {
    method: 'POST',
    body: { btcPublicKey, txHash, depositType, postActions, extraMsg },
  });
  console.log('receiveDepositMsg resp:', res);
  return res;
}

async function checkTransactionStatus(baseUrl: string, txHash: string) {
  const res = await request<{ result_code: number; result_message: string }>(
    // 1:BTC , 2:NEAR
    `${baseUrl}/v1/bridgeFromTx?fromTxHash=${txHash}&fromChainId=1`,
    {
      timeout: 60000,
      pollingInterval: 5000,
      maxPollingAttempts: 10,
      shouldStopPolling: (res) => res.result_code === 0,
    },
  );
  return res;
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
    return { rawBalance: 0, balance: 0 };
  }

  const btcRpcUrl = await getBtcRpcUrl();
  const res = await fetch(`${btcRpcUrl}/address/${account}/utxo`).then((res) => res.json());
  const rawBalance = res
    // .filter((item: any) => item?.status?.confirmed)
    ?.reduce((acc: number, cur: any) => acc + cur.value, 0);
  const balance = rawBalance / 10 ** 8;
  return { rawBalance, balance };
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
    const network = await getNetwork();

    const config = walletConfig[isDev ? 'dev' : network];

    const btcPublicKey = await getPublicKey();

    const _action: DepositMsg['post_actions'][0] = Object.assign({}, action);

    if (!btcPublicKey) {
      throw new Error('BTC Public Key is not available.');
    }
    if (!_action.receiver_id) {
      throw new Error('action.receiver_id is required');
    }
    if (!_action.amount || !new Big(_action.amount || 0).gt(0)) {
      throw new Error('action.amount is required and must be greater than 0');
    }

    const csna = await nearCall<string>(
      config.accountContractId,
      'get_chain_signature_near_account_id',
      {
        btc_public_key: btcPublicKey,
      },
    );

    _action.amount = new Big(_action.amount).toString();
    _action.gas = new Big(100).mul(10 ** 12).toFixed(0);

    const depositMsg: DepositMsg = {
      recipient_id: csna,
      post_actions: [_action],
    };

    // check receiver_id is registered
    const registerRes = await nearCall<{
      available: string;
      total: string;
    }>(action.receiver_id, 'storage_balance_of', {
      account_id: csna,
    });

    if (!registerRes?.available) {
      const storageDepositMsg = {
        storage_deposit_msg: {
          contract_id: action.receiver_id,
          deposit: new Big(0.25).mul(10 ** 24).toFixed(0),
          registration_only: true,
        },
        btc_public_key: btcPublicKey,
      };
      depositMsg.extra_msg = JSON.stringify(storageDepositMsg);
    }
    console.log('depositMsg', depositMsg);
    const userDepositAddress = await nearCall<string>(
      config.bridgeContractId,
      'get_user_deposit_address',
      { deposit_msg: depositMsg },
    );
    console.log('userDepositAddress', userDepositAddress);
    const _feeRate = feeRate || (await getBtcGasPrice());
    const txHash = await sendBitcoin(
      userDepositAddress,
      new Big(action.amount).toNumber(),
      _feeRate,
    );
    await receiveDepositMsg(config.base_url, {
      btcPublicKey,
      txHash,
      postActions: JSON.stringify(depositMsg.post_actions),
      extraMsg: depositMsg.extra_msg || '',
    });
    const checkTransactionStatusRes = await checkTransactionStatus(config.base_url, txHash);
    console.log('checkTransactionStatus resp:', checkTransactionStatusRes);
    return checkTransactionStatusRes.result_code === 0
      ? { result: 'success' }
      : { result: 'failed', error: checkTransactionStatusRes.result_message };
  } catch (error: any) {
    console.error('Error executing Bridge+BurrowSupply:', error);
    return { result: 'failed', error: error.message };
  }
}
