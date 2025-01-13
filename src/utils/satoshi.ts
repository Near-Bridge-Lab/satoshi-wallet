import { toHex } from '.';
import request from './request';

interface RequestResult<T> {
  result_code: number;
  result_message: string;
  result_data: T;
}

export async function getNonce(url: string, accountId: string) {
  const { result_code, result_message, result_data } = await request<RequestResult<string>>(
    `${url}/v1/nonce?csna=${accountId}`,
  );
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function getNearNonce(url: string, accountId: string) {
  const { result_code, result_message, result_data } = await request<RequestResult<string>>(
    `${url}/v1/nonceNear?csna=${accountId}`,
  );
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function receiveTransaction(url: string, data: any) {
  const { result_code, result_message, result_data } = await request<RequestResult<any>>(
    `${url}/v1/receiveTransaction`,
    {
      method: 'POST',
      body: data,
    },
  );
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

interface ReceiveDepositMsgParams {
  btcPublicKey: string;
  txHash: string;
  depositType?: number;
  postActions?: string;
  extraMsg?: string;
}

export async function preReceiveDepositMsg(
  url: string,
  { btcPublicKey, depositType = 1, postActions, extraMsg }: Omit<ReceiveDepositMsgParams, 'txHash'>,
) {
  const { result_code, result_message, result_data } = await request<RequestResult<any>>(
    `${url}/v1/preReceiveDepositMsg`,
    {
      method: 'POST',
      body: { btcPublicKey, depositType, postActions, extraMsg },
    },
  );
  console.log('preReceiveDepositMsg resp:', { result_code, result_message, result_data });
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function receiveDepositMsg(
  url: string,
  { btcPublicKey, txHash, depositType = 1, postActions, extraMsg }: ReceiveDepositMsgParams,
) {
  const { result_code, result_message, result_data } = await request<RequestResult<any>>(
    `${url}/v1/receiveDepositMsg`,
    {
      method: 'POST',
      body: { btcPublicKey, txHash, depositType, postActions, extraMsg },
    },
  );
  console.log('receiveDepositMsg resp:', { result_code, result_message, result_data });
  if (result_code !== 0) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function checkBridgeTransactionStatus(url: string, txHash: string) {
  const { result_code, result_message, result_data } = await request<
    RequestResult<{ Status: number; ToTxHash: string }>
  >(`${url}/v1/bridgeFromTx?fromTxHash=${txHash}&fromChainId=1`, {
    timeout: 300000,
    pollingInterval: 5000,
    maxPollingAttempts: 60,
    shouldStopPolling: (res) =>
      res.result_code === 0 && [4, 102].includes(res.result_data?.Status || 0),
  });
  console.log('checkTransactionStatus resp:', { result_code, result_message, result_data });
  if (result_data?.Status !== 4) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function checkBtcTransactionStatus(url: string, sig: string) {
  const { result_code, result_message, result_data } = await request<
    RequestResult<{ Status: number; NearHashList: string[] }>
  >(`${url}/v1/btcTx?sig=${toHex(sig)}`, {
    timeout: 300000,
    pollingInterval: 5000,
    maxPollingAttempts: 60,
    shouldStopPolling: (res) =>
      res.result_code === 0 && [3, 101, 102].includes(res.result_data?.Status || 0),
  });
  console.log('checkBtcTransactionStatus resp:', { result_code, result_message, result_data });
  if (result_data?.Status !== 3) {
    throw new Error(result_message);
  }
  return result_data;
}

export async function getWhitelist(url: string) {
  const data = await request<string[]>(`${url}/v1/whitelist/users`).catch((error) => {
    console.error('getWhitelist error:', error);
    return [] as string[];
  });
  return data;
}
