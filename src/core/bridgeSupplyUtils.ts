import { providers } from 'near-api-js';
import Big from 'big.js';
import { walletConfig, btcRpcUrls, nearRpcUrls } from '../config';
import request from '../utils/request';

async function nearViewMethod<T>(
  contractId: string,
  methodName: string,
  args: any,
  network: string,
): Promise<T> {
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

async function getDepositAddress(
  btcPublicKey: string,
  contractId: string,
  network: string,
): Promise<string> {
  const res = await nearViewMethod<string>(
    contractId,
    'get_user_dapp_deposit_address',
    {
      deposit_type: {
        BtcPublicKey: { btc_public_key: btcPublicKey, dapp_operation: 'Burrowland->Supply' },
      },
    },
    network,
  );
  return res;
}

async function getGasPrice(network: string): Promise<number> {
  const defaultFeeRate = 100;
  try {
    const btcRpcUrl = btcRpcUrls[network as keyof typeof btcRpcUrls];
    const res = await fetch(`${btcRpcUrl}/v1/fees/recommended`).then((res) => res.json());
    const feeRate = res.fastestFee;
    return feeRate || defaultFeeRate;
  } catch (error) {
    return defaultFeeRate;
  }
}

async function sendBitcoin(
  btcProvider: any,
  address: string,
  amount: string,
  feeRate: number,
): Promise<string> {
  const satoshis = new Big(amount).mul(10 ** 8).toNumber();
  const txHash = await btcProvider.sendBitcoin(address, satoshis, { feeRate });
  return txHash;
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

interface ExecuteBurrowSupplyParams {
  /** btc amount, e.g. 0.01 */
  amount: string;
  /** fee rate, if not provided, will use the recommended fee rate from the btc node */
  feeRate?: number;
  /** environment, default is mainnet */
  environment?: 'dev' | 'testnet' | 'mainnet';
}

export async function executeBurrowSupply({
  amount,
  feeRate,
  environment = 'mainnet',
}: ExecuteBurrowSupplyParams): Promise<void> {
  try {
    if (typeof window === 'undefined' || !window.btcContext) {
      throw new Error('BTC Provider is not initialized.');
    }
    const btcProvider = window.btcContext;

    const network = environment === 'dev' ? 'testnet' : environment;

    const config = walletConfig[environment];

    const btcPublicKey = await btcProvider.getPublicKey();

    if (!btcPublicKey) {
      throw new Error('BTC Public Key is not available.');
    }

    const address = await getDepositAddress(btcPublicKey, config.contractId, network);
    const _feeRate = feeRate || (await getGasPrice(network));
    console.log('feeRate', _feeRate);
    const txHash = await sendBitcoin(btcProvider, address, amount, _feeRate);
    const receiveDepositMsgRes = await receiveDepositMsg(config.base_url, { btcPublicKey, txHash });
    console.log('receiveDepositMsg resp:', receiveDepositMsgRes);
    const checkTransactionStatusRes = await checkTransactionStatus(config.base_url, txHash);
    console.log('checkTransactionStatus resp:', checkTransactionStatusRes);
  } catch (error) {
    console.error('Error executing Bridge+BurrowSupply:', error);
  }
}
