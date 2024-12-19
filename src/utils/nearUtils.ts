import type { ProviderService } from '@near-wallet-selector/core/src/lib/services';
import { providers } from 'near-api-js';
import { nearRpcUrls } from '../config';
import { delay } from '.';

export async function nearCallFunction<T>(
  contractId: string,
  methodName: string,
  args: any,
  options: {
    network?: string;
    provider?: ProviderService;
  },
): Promise<T> {
  const nearProvider =
    options?.provider ||
    new providers.FailoverRpcProvider(
      nearRpcUrls[options?.network as keyof typeof nearRpcUrls].map(
        (url) => new providers.JsonRpcProvider({ url }),
      ),
    );
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
  const results = new Map();

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

  return hashes.map((hash) => results.get(hash));
}
