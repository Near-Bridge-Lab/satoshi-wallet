import type { AAOptions } from '@particle-network/aa';

export function shortString(str: any): string {
  if (Array.isArray(str)) {
    str = '[' + str.toString() + ']';
  }
  if (str) {
    if (typeof str.toString === 'function') {
      str = str.toString();
    }
    if (str.length <= 10) {
      return str;
    }
    return `${str.slice(0, 5)}...${str.slice(str.length - 5, str.length)}`;
  }
  return '';
}

export async function copyToClipboard(text: string) {
  const clipboardCopy = async () => {
    if (navigator.clipboard) {
      return navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);

      textarea.select();
      const result = document.execCommand('copy');

      document.body.removeChild(textarea);

      if (!result) {
        throw new Error('Copy to clipboard failed');
      }
    }
  };

  return new Promise((resolve, reject) => {
    clipboardCopy().then(resolve).catch(reject);
  });
}

export const defaultTokenIcon =
  'https://static.particle.network/token-list/defaultToken/default.png';

export const ipfsToSrc = (ipfs: string) => {
  if (!ipfs || !ipfs.startsWith('ipfs://')) {
    return ipfs || '';
  }

  return `https://ipfs.particle.network/${encodeURI(ipfs.slice(7))}`;
};

export const checkBTCVersion = (
  accountContracts: AAOptions['accountContracts'],
  accountContractKey: string,
  version: string,
) => {
  if (!accountContracts[accountContractKey]) {
    return false;
  }
  return accountContracts[accountContractKey].some((item) => item.version === version);
};

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryOperation<T>(
  operation: () => Promise<T> | T,
  shouldStop: (result: T) => boolean,
  {
    maxRetries = 3,
    delayMs = 1000,
  }: {
    maxRetries?: number;
    delayMs?: number;
  } = {},
): Promise<T> {
  let retries = 0;

  while (retries <= maxRetries) {
    const result = await operation();
    if (shouldStop(result)) {
      return result;
    }
    if (retries === maxRetries) {
      console.warn('Max retries reached');
      return result;
    }
    retries++;
    await delay(delayMs);
  }
  throw new Error('Unexpected execution path');
}

export function toHex(originalString: string) {
  const charArray = originalString.split('');
  const asciiArray = charArray.map((char) => char.charCodeAt(0));
  const hexArray = asciiArray.map((code) => code.toString(16));
  let hexString = hexArray.join('');
  hexString = hexString.replace(/(^0+)/g, '');
  return hexString;
}

export function isMobile(): boolean {
  if (typeof window !== 'undefined') {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator?.userAgent,
    );
  }
  return false;
}

export function safeJSONParse<T>(str: string): T | undefined {
  try {
    return JSON.parse(str) as T;
  } catch (e) {
    console.error('safeJSONParse', e);
    return undefined;
  }
}

export function safeJSONStringify(obj: any): string | undefined {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    console.error('safeJSONStringify', e);
    return undefined;
  }
}

export function storageStore(namespace?: string, options?: { storage?: Storage }) {
  if (typeof window === 'undefined') return;
  const _namespace = namespace || 'SATOSHI_WALLET_DEFAULT';
  const storage = options?.storage || window?.localStorage;
  const namespaceKey = (key: string) => {
    return _namespace + ':' + key;
  };
  return {
    set(key: string, value: any) {
      const _value = safeJSONStringify(value);
      _value ? storage.setItem(namespaceKey(key), _value) : storage.removeItem(namespaceKey(key));
    },
    get<T>(key: string) {
      const _value = storage.getItem(namespaceKey(key));
      return _value ? safeJSONParse<T>(_value) : undefined;
    },
    remove(key: string) {
      storage.removeItem(namespaceKey(key));
    },
    clearAll: function clearAll() {
      for (const key in storage) {
        if (key.startsWith(namespace + ':')) {
          storage.removeItem(key);
        }
      }
    },
  };
}

export const getUrlQuery = (url?: string) => {
  try {
    const search = url
      ? url.split('?')[1]?.split('#')[0]
      : window.location.search.substring(1).split('#')[0];
    const urlSearchParams = new URLSearchParams(search);
    const entries = urlSearchParams.entries();
    const query = {} as Record<string, any>;
    for (const [key, value] of entries) {
      if (query[key]) {
        query[key] = Array.isArray(query[key])
          ? [...(query[key] as string[]), value]
          : [query[key], value];
      } else {
        query[key] = value;
      }
    }
    return query;
  } catch (error) {
    console.error('getUrlQuery', error);
    return {};
  }
};
