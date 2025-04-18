import { Wallet } from '@near-wallet-selector/core';
interface RequestOptions<T> extends RequestInit {
  body?: RequestInit['body'] | any;
  retryCount?: number;
  timeout?: number;
  cacheTimeout?: number;
  pollingInterval?: number;
  maxPollingAttempts?: number;
  shouldStopPolling?: (response: T) => boolean;
}

const cache = new Map<string, { timestamp: number; data: any }>();

const defaultCacheTimeout = 3000;

export default async function request<T>(url: string, options?: RequestOptions<T>): Promise<T> {
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const cacheTimeout = options?.cacheTimeout || defaultCacheTimeout;

  const headers = {
    ...defaultHeaders,
    ...options?.headers,
  };

  let body = options?.body;
  if (headers['Content-Type'] === 'application/json' && body && typeof body !== 'string') {
    body = JSON.stringify(body);
  }

  const method = options?.method || 'GET';
  const cacheKey = method.toUpperCase() === 'GET' ? url : null;

  if (cacheKey) {
    const cached = cache.get(cacheKey);
    const isCacheValid = cached && Date.now() - cached.timestamp < cacheTimeout;
    if (isCacheValid) {
      return Promise.resolve(cached.data as T);
    }
  }

  const newOptions: RequestInit = {
    ...options,
    headers,
    body,
    method,
  };

  const retryCount = options?.retryCount ?? 1;

  const controller = new AbortController();
  const timeout = options?.timeout || 20000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { ...newOptions, signal: controller.signal }).finally(() =>
      clearTimeout(timeoutId),
    );

    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();

    if (cacheKey) {
      cache.set(cacheKey, { timestamp: Date.now(), data });
      setTimeout(() => {
        cache.delete(cacheKey);
      }, cacheTimeout);
    }

    if (options?.shouldStopPolling && options.shouldStopPolling(data)) {
      return data as T;
    }

    return data as T;
  } catch (err) {
    console.error(err);
    if (retryCount > 0) {
      console.log(`Retrying... attempts left: ${retryCount}`);
      return request(url, { ...options, retryCount: retryCount - 1 });
    } else if (options?.pollingInterval && options?.maxPollingAttempts) {
      if (options.maxPollingAttempts > 0) {
        console.log(`Polling... attempts left: ${options.maxPollingAttempts}`);
        await new Promise((resolve) => setTimeout(resolve, options.pollingInterval)); // 等待轮询间隔时间
        return request(url, {
          ...options,
          maxPollingAttempts: options.maxPollingAttempts - 1,
          retryCount: retryCount,
        });
      }
    }
    return Promise.reject(err);
  }
}

type RpcToWalletAction = 'signAndSendTransaction' | 'signAndSendTransactions';
type RpcToWallet<T extends RpcToWalletAction> = Parameters<Wallet[T]>[0];

export function rpcToWallet<T extends RpcToWalletAction>(
  action: T,
  params: RpcToWallet<T>,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substring(7);

    const urlParams = new URLSearchParams(window.location.search);
    const origin = urlParams.get('origin') || '*';

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Wallet request timeout'));
    }, 60000);

    function handleMessage(event: {
      origin: string;
      data: { requestId: string; data: any; error: string; success: boolean };
    }) {
      if (!event.data || typeof event.data !== 'object') {
        return;
      }

      if (event.origin !== origin && origin !== '*') {
        console.warn('Untrusted message origin:', event.origin);
        return;
      }

      const { requestId: responseId, data, error, success } = event.data;

      if (responseId === requestId) {
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);

        if (success) {
          resolve(data);
        } else {
          reject(new Error(error));
        }
      }
    }

    window.addEventListener('message', handleMessage);

    window.parent.postMessage(
      {
        action,
        requestId,
        data: params,
      },
      origin,
    );
  });
}
