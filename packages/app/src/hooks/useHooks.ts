'use client';

import {
  type DependencyList,
  type EffectCallback,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
} from 'react';
import { debounce, type DebounceSettings } from 'lodash-es';
import { safeJSONParse, safeJSONStringify, storageStore } from '../utils/common';
import dayjs from '@/utils/dayjs';

export function useClient() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  return { isClient };
}

type DebounceOptions = number | ({ wait: number } & Partial<DebounceSettings>);
type RequestOptions<T> = {
  refreshDeps?: React.DependencyList;
  before?: () => boolean | undefined;
  manual?: boolean;
  onSuccess?: (res: T) => void;
  onError?: (err: Error) => void;
  debounceOptions?: DebounceOptions;
  retryCount?: number;
  retryInterval?: number;
  pollingInterval?: number;
};

export function useRequest<T>(request: () => Promise<T>, options?: RequestOptions<T>) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const {
    refreshDeps = [],
    before,
    manual,
    onSuccess,
    onError,
    debounceOptions,
    retryCount = 0,
    retryInterval = 0,
    pollingInterval,
  } = useMemo(() => options || {}, [options]);

  const pollingTimer = useRef<NodeJS.Timeout | null>(null);
  const clearPolling = useCallback(() => {
    if (pollingTimer.current) {
      clearTimeout(pollingTimer.current);
      pollingTimer.current = null;
    }
  }, []);

  const run = useCallback(async () => {
    clearPolling();
    let attempts = 0;

    const executeRequest = async () => {
      try {
        setLoading(true);
        const res = await request();
        setData(res);
        onSuccess?.(res);
        return true;
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err : new Error(String(err)));
        onError?.(err instanceof Error ? err : new Error(String(err)));
        return false;
      } finally {
        setLoading(false);
      }
    };

    const attemptRequest = async () => {
      const success = await executeRequest();
      if (!success && attempts < retryCount) {
        attempts += 1;
        setTimeout(attemptRequest, retryInterval);
      }
    };

    if (before && !before()) return;
    attemptRequest();

    if (pollingInterval) {
      pollingTimer.current = setTimeout(run, pollingInterval);
    }
  }, [
    clearPolling,
    before,
    pollingInterval,
    request,
    onSuccess,
    onError,
    retryCount,
    retryInterval,
  ]);

  useDebouncedEffect(
    () => {
      if (manual) return;
      if (before && !before()) return;
      clearPolling();
      run();
      return () => clearPolling();
    },
    [...refreshDeps, clearPolling],
    debounceOptions,
  );

  return {
    run,
    data,
    setData,
    loading,
    setLoading,
    error,
    setError,
    clearPolling,
  };
}

export function useDebouncedEffect(
  effect: EffectCallback,
  deps: React.DependencyList,
  debounceOptions?: DebounceOptions,
) {
  useEffect(() => {
    const options =
      typeof debounceOptions === 'number' ? { wait: debounceOptions } : debounceOptions;
    const debouncedEffect = debounce(
      () => {
        const cleanupFn = effect();
        if (cleanupFn) {
          debouncedEffect.flush = cleanupFn as any;
        }
      },
      options?.wait,
      options,
    );

    debouncedEffect();

    return () => {
      debouncedEffect.cancel();
      if (debouncedEffect.flush) {
        debouncedEffect.flush();
      }
    };
  }, [...deps]);
}

export function useDebouncedMemo<T>(
  factory: () => Promise<T> | undefined | null,
  deps: DependencyList,
  options?: DebounceOptions,
) {
  const [val, setVal] = useState<T | undefined>();
  useDebouncedEffect(
    () => {
      let cancel = false;
      const promise = factory();
      if (promise === undefined || promise === null) return;
      promise.then((val) => {
        if (!cancel) {
          setVal(val);
        }
      });
      return () => {
        cancel = true;
      };
    },
    deps,
    options ?? 0,
  );
  return val;
}

export function useAutoResetState<T>(defaultValue: T, wait?: number) {
  const [state, set] = useState<T>(defaultValue);
  const setState = (value: T) => {
    set(value);
    setTimeout(() => {
      set(defaultValue);
    }, wait || 1000);
  };
  return [state, setState] as const;
}

export function useTime(step?: 'second' | 'minute') {
  const [time, setTime] = useState(dayjs());

  useEffect(() => {
    const updateTime = () => setTime(dayjs());

    const interval = step === 'minute' ? 60000 : 1000;

    const timer = setInterval(updateTime, interval);

    return () => clearInterval(timer);
  }, [step]);

  return time;
}

export function useInterval(callback: () => void, delay: number) {
  const savedCallback = useRef<() => void>();
  const intervalId = useRef<number | null>(null);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    function tick() {
      savedCallback.current?.();
    }

    if (delay !== undefined && delay !== null) {
      intervalId.current = window.setInterval(tick, delay);
      return () => {
        if (intervalId.current) {
          window.clearInterval(intervalId.current);
        }
      };
    }
  }, [delay]);

  const cancel = () => {
    if (intervalId.current !== null) {
      window.clearInterval(intervalId.current);
      intervalId.current = null;
    }
  };

  return cancel;
}

export const useCountDown = (time: number, step?: 'second' | 'minute') => {
  const [count, setCount] = useState(isNaN(time) ? 0 : time);

  useEffect(() => {
    setCount(isNaN(time) ? 0 : time);
  }, [time]);

  useEffect(() => {
    const interval = step === 'minute' ? 60000 : 1000;
    const timer = setInterval(() => {
      setCount((currentCount) => {
        if (currentCount <= 1) {
          clearInterval(timer);
          return 0;
        }
        return currentCount - 1;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [step]);

  return count;
};

interface UseInfiniteScrollProps {
  hasMore?: boolean;
  distance?: number;
  isEnabled?: boolean;
  shouldUseLoader?: boolean;
  onLoadMore?: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement>;
  loaderRef?: React.RefObject<HTMLElement>;
}

export function useInfiniteScroll(props: UseInfiniteScrollProps = {}) {
  const {
    hasMore = true,
    distance = 250,
    isEnabled = true,
    shouldUseLoader = true,
    onLoadMore,
    scrollContainerRef,
    loaderRef,
  } = props;

  const previousY = useRef<number>();
  const previousRatio = useRef<number>(0);

  useLayoutEffect(() => {
    const scrollContainerNode = scrollContainerRef?.current || (window as any);

    if (!isEnabled || !hasMore) return;

    if (shouldUseLoader && loaderRef?.current) {
      const loaderNode = loaderRef.current;

      const options = {
        root: scrollContainerNode === window ? null : scrollContainerNode,
        rootMargin: `0px 0px ${distance}px 0px`,
      } as IntersectionObserverInit;

      const listener = (entries: IntersectionObserverEntry[]) => {
        entries.forEach(({ isIntersecting, intersectionRatio, boundingClientRect = {} }) => {
          const y = boundingClientRect.y || 0;

          if (
            isIntersecting &&
            intersectionRatio >= previousRatio.current &&
            (!previousY.current || y < previousY.current)
          ) {
            onLoadMore?.();
          }

          previousY.current = y;
          previousRatio.current = intersectionRatio;
        });
      };

      const observer = new IntersectionObserver(listener, options);
      observer.observe(loaderNode);

      return () => observer.disconnect();
    } else {
      const debouncedOnLoadMore = onLoadMore ? debounce(onLoadMore, 200) : undefined;

      const checkIfNearBottom = () => {
        const scrollTop =
          scrollContainerNode === window ? window.pageYOffset : scrollContainerNode.scrollTop;
        const scrollHeight =
          scrollContainerNode === window
            ? document.documentElement.scrollHeight
            : scrollContainerNode.scrollHeight;
        const clientHeight =
          scrollContainerNode === window ? window.innerHeight : scrollContainerNode.clientHeight;

        if (scrollHeight - scrollTop <= clientHeight + distance) {
          debouncedOnLoadMore?.();
        }
      };

      if (scrollContainerNode === window) {
        window.addEventListener('scroll', checkIfNearBottom);
      } else {
        scrollContainerNode.addEventListener('scroll', checkIfNearBottom);
      }

      return () => {
        if (scrollContainerNode === window) {
          window.removeEventListener('scroll', checkIfNearBottom);
        } else {
          scrollContainerNode.removeEventListener('scroll', checkIfNearBottom);
        }
      };
    }
  }, [hasMore, distance, isEnabled, onLoadMore, shouldUseLoader, loaderRef, scrollContainerRef]);
}

export function useCopyClipboard() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      });
    },
    [setCopied],
  );

  return { copied, copy };
}

export function useStorageState<T>(
  key: string,
  defaultValue: T,
  options?: { storage?: Storage; namespace?: string },
) {
  const { storage, namespace = 'DELTA_DEFAULT' } = options || {};
  const storageAPI = storageStore(namespace, { storage });
  const [state, _setState] = useState<T>(() => {
    const storedValue = storageAPI?.get(key) as T;
    return storedValue !== undefined ? storedValue : defaultValue;
  });

  const setState: typeof _setState = (value) => {
    _setState(value);
    const _value = typeof value === 'function' ? (value as any)(state) : value;
    if (_value === undefined) {
      storageAPI?.remove(key);
    } else {
      storageAPI?.set(key, _value);
    }
  };

  return [state, setState] as const;
}

export function useScrollToBottom(callback?: () => void) {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!elementRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = elementRef.current;

      if (scrollTop + clientHeight >= scrollHeight) {
        if (callback) callback();
      }
    };

    const element = elementRef.current;
    element?.addEventListener('scroll', handleScroll);

    return () => {
      element?.removeEventListener('scroll', handleScroll);
    };
  }, [callback]);

  return elementRef;
}
