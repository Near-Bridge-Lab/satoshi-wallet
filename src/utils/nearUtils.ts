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

  const maxAttempts = 3;

  // Helper function to poll status for a single transaction hash
  const pollStatus = async (hash: string) => {
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        const result = await provider.txStatus(hash, 'unused', 'FINAL');

        if (result && result.status) {
          console.log(`Transaction ${hash} result:`, result);
          return result;
        }
      } catch (error: any) {
        console.error(`Failed to fetch transaction status for ${hash}: ${error.message}`);
      }

      if (attempt === maxAttempts) {
        throw new Error(`Transaction not found after max attempts: ${hash}`);
      }

      // Delay before next attempt
      await delay(10000);
      console.log(`RPC request failed for ${hash}, retrying ${maxAttempts - attempt} more times`);
    }
  };

  // Poll all transaction statuses in parallel
  const results = await Promise.all(hashes.map((hash) => pollStatus(hash)));

  return results;
}
