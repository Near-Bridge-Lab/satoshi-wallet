import type { ProviderService } from '@near-wallet-selector/core/src/lib/services';
import { providers } from 'near-api-js';
import { nearRpcUrls } from '../config';
import { delay } from '.';
import type { FinalExecutionOutcome } from '@near-wallet-selector/core';
import { withCache } from './request';

export function getNearProvider(option: { network?: string; provider?: ProviderService }) {
  return (
    option.provider ||
    new providers.FailoverRpcProvider(
      nearRpcUrls[option?.network as keyof typeof nearRpcUrls].map(
        (url) => new providers.JsonRpcProvider({ url }),
      ),
    )
  );
}

export async function nearCallFunction<T>(
  contractId: string,
  methodName: string,
  args: any,
  options: {
    network?: string;
    provider?: ProviderService;
    cacheTimeout?: number;
    skipCache?: boolean;
  } = {},
): Promise<T> {
  if (!options.skipCache) {
    const cacheKey = `near:${contractId}:${methodName}:${args ? JSON.stringify(args) : ''}`;
    return withCache(
      cacheKey,
      () => executeNearCall<T>(contractId, methodName, args, options),
      options.cacheTimeout,
    );
  }

  return executeNearCall<T>(contractId, methodName, args, options);
}

async function executeNearCall<T>(
  contractId: string,
  methodName: string,
  args: any,
  options: {
    network?: string;
    provider?: ProviderService;
  },
): Promise<T> {
  const nearProvider = getNearProvider(options);
  const res: any = await nearProvider.query({
    request_type: 'call_function',
    account_id: contractId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    finality: 'final',
  });
  return JSON.parse(Buffer.from(res.result).toString()) as T;
}

export async function pollTransactionStatuses(network: string, hashes: string[]) {
  const provider = new providers.FailoverRpcProvider(
    Object.values(nearRpcUrls[network as keyof typeof nearRpcUrls]).map(
      (url) => new providers.JsonRpcProvider({ url }),
    ),
  );

  const maxAttempts = 30;
  let currentAttempt = 0;
  const pendingHashes = new Set(hashes);
  const results = new Map<string, FinalExecutionOutcome>();

  while (pendingHashes.size > 0 && currentAttempt < maxAttempts) {
    currentAttempt++;

    const promises = Array.from(pendingHashes).map(async (hash) => {
      try {
        const result = await provider.txStatus(hash, 'unused', 'FINAL');
        if (result && result.status) {
          console.log(`Transaction ${hash} result:`, result);
          results.set(hash, result);
          pendingHashes.delete(hash);
        }
      } catch (error: any) {
        console.error(`Failed to fetch transaction status for ${hash}: ${error.message}`);
      }
    });

    await Promise.all(promises);

    if (pendingHashes.size > 0) {
      if (currentAttempt === maxAttempts) {
        throw new Error(
          `Transactions not found after max attempts: ${Array.from(pendingHashes).join(', ')}`,
        );
      }
      console.log(
        `Waiting for ${pendingHashes.size} transactions, retrying ${maxAttempts - currentAttempt} more times`,
      );
      await delay(10000);
    }
  }

  const result = hashes.map((hash) => results.get(hash)).filter(Boolean) as FinalExecutionOutcome[];
  return result;
}
