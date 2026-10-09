import { providers } from 'near-api-js';

/**
 * The wallet shares its public RPC quota (same IP) with the dapp that embeds it, so every RPC
 * request goes through one limiter: at most `MAX_CONCURRENT_REQUESTS` in flight, and consecutive
 * requests start at least `MIN_REQUEST_INTERVAL` ms apart.
 */
export const MAX_CONCURRENT_REQUESTS = 4;
const MIN_REQUEST_INTERVAL = 200;

let activeRequests = 0;
let nextStartAt = 0;
const waitingRequests: Array<() => void> = [];

async function limitRequest<T>(request: () => Promise<T>): Promise<T> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
  } else {
    await new Promise<void>((resolve) => waitingRequests.push(resolve));
  }

  try {
    const now = Date.now();
    const startAt = Math.max(now, nextStartAt);
    nextStartAt = startAt + MIN_REQUEST_INTERVAL;
    if (startAt > now) await new Promise((resolve) => setTimeout(resolve, startAt - now));
    return await request();
  } finally {
    const next = waitingRequests.shift();
    if (next) next();
    else activeRequests--;
  }
}

type ProtocolConfigParams = Parameters<providers.JsonRpcProvider['experimental_protocolConfig']>[0];
type ProtocolConfig = ReturnType<providers.JsonRpcProvider['experimental_protocolConfig']>;

export class ThrottledJsonRpcProvider extends providers.JsonRpcProvider {
  private protocolConfigs = new Map<string, ProtocolConfig>();

  sendJsonRpc<T>(method: string, params: object): Promise<T> {
    return limitRequest(() => super.sendJsonRpc<T>(method, params));
  }

  /** The runtime config only changes with protocol upgrades, so it is fetched once per provider. */
  experimental_protocolConfig(blockReference: ProtocolConfigParams): ProtocolConfig {
    const key = JSON.stringify(blockReference);
    let config = this.protocolConfigs.get(key);
    if (!config) {
      config = super.experimental_protocolConfig(blockReference).catch((error) => {
        this.protocolConfigs.delete(key);
        throw error;
      });
      this.protocolConfigs.set(key, config);
    }
    return config;
  }
}
