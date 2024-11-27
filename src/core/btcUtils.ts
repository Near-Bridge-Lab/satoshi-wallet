import { providers } from 'near-api-js';
import Big from 'big.js';
import { walletConfig, btcRpcUrls, nearRpcUrls } from '../config';
import request from '../utils/request';
import { delay } from '../utils';

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

async function nearViewMethod<T>(contractId: string, methodName: string, args: any): Promise<T> {
  const network = await getNetwork();
  const nearProvider = new providers.FailoverRpcProvider(
    nearRpcUrls[network as keyof typeof nearRpcUrls].map(
      (url) => new providers.JsonRpcProvider({ url }),
    ),
  );
  const res: any = await nearProvider.query({
    request_type: 'call_function',
    account_id: contractId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    finality: 'optimistic',
  });
  return JSON.parse(Buffer.from(res.result).toString());
}

async function getDepositAddress(btcPublicKey: string, contractId: string): Promise<string> {
  const res = await nearViewMethod<string>(contractId, 'get_user_dapp_deposit_address', {
    deposit_type: {
      BtcPublicKey: { btc_public_key: btcPublicKey, dapp_operation: 'Burrowland->Supply' },
    },
  });
  return res;
}

async function receiveDepositMsg(
  baseUrl: string,
  {
    btcPublicKey,
    txHash,
    depositType = 1,
  }: { btcPublicKey: string; txHash: string; depositType?: number },
) {
  const res = await request<any>(`${baseUrl}/v1/receiveDepositMsg`, {
    method: 'POST',
    body: { btcPublicKey, txHash, depositType },
  });
  return res;
}

async function checkTransactionStatus(baseUrl: string, txHash: string) {
  const res = await request<any>(`${baseUrl}/v1/bridgeFromTx?fromTxHash=${txHash}`, {
    timeout: 60000,
    pollingInterval: 5000,
    maxPollingAttempts: 10,
    shouldStopPolling: (res) => res.result_code === 0,
  });
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

let retryCount = 0;
export async function getBtcBalance() {
  const { account } = getBtcProvider();
  if (!account) {
    retryCount++;
    if (retryCount > 3) {
      throw new Error('BTC Account is not available.');
    }
    await delay(1000);
    return getBtcBalance();
  }
  retryCount = 0;
  const btcRpcUrl = await getBtcRpcUrl();
  const res = await fetch(`${btcRpcUrl}/address/${account}/utxo`).then((res) => res.json());
  const rawBalance = res.reduce((acc: number, cur: any) => acc + cur.value, 0);
  const balance = rawBalance / 10 ** 8;
  console.log('btc balance:', balance);
  return { rawBalance, balance };
}

export async function sendBitcoin(
  address: string,
  amount: string,
  feeRate: number,
): Promise<string> {
  const { sendBitcoin } = getBtcProvider();
  const satoshis = new Big(amount).mul(10 ** 8).toNumber();
  const txHash = await sendBitcoin(address, satoshis, { feeRate });
  return txHash;
}

interface ExecuteBurrowSupplyParams {
  /** btc amount, e.g. 0.01 */
  amount: string;
  /** fee rate, if not provided, will use the recommended fee rate from the btc node */
  feeRate?: number;
  /** is dev environment */
  isDev?: boolean;
}

export async function executeBurrowSupply({
  amount,
  feeRate,
  isDev = false,
}: ExecuteBurrowSupplyParams): Promise<void> {
  try {
    const { getPublicKey } = getBtcProvider();
    const network = await getNetwork();

    const config = walletConfig[isDev ? 'dev' : network];

    const btcPublicKey = await getPublicKey();

    if (!btcPublicKey) {
      throw new Error('BTC Public Key is not available.');
    }

    const address = await getDepositAddress(btcPublicKey, config.contractId);
    const _feeRate = feeRate || (await getBtcGasPrice());
    console.log('feeRate', _feeRate);
    const txHash = await sendBitcoin(address, amount, _feeRate);
    const receiveDepositMsgRes = await receiveDepositMsg(config.base_url, { btcPublicKey, txHash });
    console.log('receiveDepositMsg resp:', receiveDepositMsgRes);
    const checkTransactionStatusRes = await checkTransactionStatus(config.base_url, txHash);
    console.log('checkTransactionStatus resp:', checkTransactionStatusRes);
  } catch (error) {
    console.error('Error executing Bridge+BurrowSupply:', error);
  }
}
