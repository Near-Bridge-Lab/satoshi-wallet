import type { RequestArguments } from '@particle-network/aa';
import { chains } from '@particle-network/chains';
import { EventEmitter } from 'events';
import { UnsupportedProviderMethodError, createPublicClient, http, type PublicClient } from 'viem';

export class AASignerProvider {
  private events: EventEmitter;
  chainId = 1;
  publicClient: PublicClient;
  constructor(
    public supportChainIds: number[],
    public projectId: string,
    public clientKey: string,
    public rpcUrls: Record<number, string> | undefined,
  ) {
    this.events = new EventEmitter();
    this.events.setMaxListeners(100);

    if (typeof window !== 'undefined') {
      const localChainId = localStorage.getItem('connect-evm-chain-id');
      if (localChainId && supportChainIds.includes(Number(localChainId))) {
        this.chainId = Number(localChainId);
      } else {
        const chainId = supportChainIds[0];
        if (chainId) {
          localStorage.setItem('connect-evm-chain-id', chainId.toString());
          this.chainId = chainId;
        }
      }
    }

    this.publicClient = this.getPublicClient();
  }

  async request(arg: RequestArguments) {
    if (
      arg.method === 'eth_sendTransaction' ||
      arg.method === 'wallet_addEthereumChain' ||
      arg.method === 'wallet_watchAsset' ||
      arg.method === 'eth_sign'
    ) {
      throw new UnsupportedProviderMethodError(
        new Error('The Provider does not support the requested method.'),
      );
    }

    const result = await this.publicClient.request(arg as any);
    return result;
  }

  personalSign = async (message: string): Promise<string> => {
    throw new Error('Wallet not connected!');
  };

  getPublicKey = async (): Promise<string> => {
    throw new Error('Wallet not connected!');
  };

  removeListener(event: string, listener: (...args: any[]) => void) {
    this.events.removeListener(event, listener);
    return this;
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.events.on(event, listener);
    return this;
  }

  once(event: string, listener: any) {
    this.events.once(event, listener);
    return this;
  }

  off(event: string, listener: any) {
    this.events.off(event, listener);
    return this;
  }

  emit(event: string, ...args: any[]) {
    this.events.emit(event, args);
  }

  getPublicClient = () => {
    const rpcUrl =
      this?.rpcUrls?.[this.chainId] || chains.getEVMChainInfoById(this.chainId || 1)?.rpcUrl;
    console.log('rpcUrl', rpcUrl);

    return createPublicClient({
      transport: http(rpcUrl),
    }) as unknown as PublicClient;
  };
}
