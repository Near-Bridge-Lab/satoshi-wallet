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

export function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  timeout: number = defaultCacheTimeout,
): Promise<T> {
  const cached = cache.get(key);
  const isCacheValid = cached && Date.now() - cached.timestamp < timeout;

  if (isCacheValid) {
    return Promise.resolve(cached.data as T);
  }

  return fetcher().then((data) => {
    cache.set(key, { timestamp: Date.now(), data });
    setTimeout(() => {
      cache.delete(key);
    }, timeout);
    return data;
  });
}

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

    if (options?.shouldStopPolling) {
      if (options.shouldStopPolling(data)) {
        return data as T;
      }
      throw new Error('Polling should continue');
    }

    if (cacheKey) {
      cache.set(cacheKey, { timestamp: Date.now(), data });
      setTimeout(() => {
        cache.delete(cacheKey);
      }, cacheTimeout);
    }

    return data as T;
  } catch (err) {
    if (retryCount > 0) {
      console.log(`Retrying... attempts left: ${retryCount}`);
      return request(url, { ...options, retryCount: retryCount - 1 });
    } else if (options?.pollingInterval && options?.maxPollingAttempts) {
      if (options.maxPollingAttempts > 0) {
        console.log(`Polling... attempts left: ${options.maxPollingAttempts}`);
        await new Promise((resolve) => setTimeout(resolve, options.pollingInterval));
        return request(url, {
          ...options,
          maxPollingAttempts: options.maxPollingAttempts - 1,
          retryCount: retryCount,
        });
      }
    }
    console.error(err);
    return Promise.reject(err);
  }
}
