import EventEmitter from 'events';
import type { Address } from 'sats-connect';
import icon from '../icons/xverse.png';
import { BaseConnector, type WalletMetadata } from './base';
import { MobileWalletConnect } from './universalLink';
import { isMobile } from '../utils';

interface XverseAddress extends Address {
  walletType: 'software' | 'ledger';
}
export class XverseConnector extends BaseConnector {
  #network = 'Mainnet';
  #event = new EventEmitter();
  constructor() {
    super();
    this.#event.setMaxListeners(100);
  }
  readonly metadata: WalletMetadata = {
    id: 'xverse',
    name: 'Xverse Wallet',
    icon,
    downloadUrl: 'https://www.xverse.app',
  };
  isReady(): boolean {
    if (typeof window !== 'undefined') {
      if (typeof window.BitcoinProvider !== 'undefined') return true;
      if (isMobile()) return true;
    }
    return false;
  }
  private loadAccounts = async (network: 'Mainnet' | 'Testnet') => {
    const { AddressPurpose } = await import('sats-connect');
    const provider = this.getProvider();
    await provider.request('wallet_requestPermissions', undefined);
    const { result: walletType } = await provider.request('wallet_getWalletType', undefined);

    const { result } = await provider.request('getAddresses', {
      purposes: [AddressPurpose.Payment, AddressPurpose.Ordinals],
      message: 'Address for receiving Ordinals and payments',
    });
    const addresses: XverseAddress[] = result.addresses.map((item: XverseAddress) => ({
      ...item,
      walletType,
    }));
    console.log('🚀 ~ XverseConnector ~ loadAccounts ~ res:', addresses);

    localStorage.setItem('btc-connect-xverse-addresses-' + network, JSON.stringify(addresses));
    return addresses;
  };
  async sendInscription(): Promise<{ txid: string }> {
    throw new Error('Unsupported');
  }
  async requestAccounts(): Promise<string[]> {
    if (isMobile()) {
      try {
        this.getProvider();
      } catch (error) {
        MobileWalletConnect.redirectToWallet(this.metadata.id);
        return [];
      }
    }
    const addresses = await this.loadAccounts(this.#network as any);
    return addresses.map((item) => item.address);
  }
  async getAddresses() {
    const data = localStorage.getItem('btc-connect-xverse-addresses-' + this.#network);
    if (data) {
      return JSON.parse(data) as XverseAddress[];
    }
    return [];
  }
  async getCurrentAddress() {
    const addresses = await this.getAddresses();
    const address = addresses?.[0];
    if (!address) {
      throw new Error(`${this.metadata.name} not connected!`);
    }
    return address;
  }
  async getAccounts() {
    if (!this.isReady()) {
      throw new Error(`${this.metadata.name} is not install!`);
    }
    const addresses = await this.getAddresses();
    return addresses.map((item) => item.address);
  }
  async getPublicKey(): Promise<string> {
    const address = await this.getCurrentAddress();
    return address.publicKey;
  }
  async signMessage(signStr: string): Promise<string> {
    const address = await this.getCurrentAddress();
    const provider = this.getProvider();
    const { result } = await provider.request('signMessage', {
      address: address.address,
      message: signStr,
      protocol: 'ECDSA',
    });
    console.log('xverse walletType', address.walletType);
    console.log('xverse raw sig', result.signature);
    const modifiedSig = Buffer.from(result.signature, 'base64');
    modifiedSig[0] = 31 + ((modifiedSig[0] - 31) % 4);
    const sig = modifiedSig.toString('base64');
    console.log('xverse modified sig', sig);
    return sig;
  }
  on(event: string, handler: (data?: unknown) => void) {
    return this.#event.on(event, handler);
  }
  removeListener(event: string, handler: (data?: unknown) => void) {
    return this.#event.removeListener(event, handler);
  }
  getProvider() {
    const provider = window.BitcoinProvider;
    if (!provider) {
      throw new Error(`${this.metadata.name} is not install!`);
    }
    return provider;
  }
  async getNetwork(): Promise<'livenet' | 'testnet'> {
    if (!this.isReady()) {
      throw new Error(`${this.metadata.name} is not install!`);
    }
    return this.#network === 'Mainnet' ? 'livenet' : 'testnet';
  }
  async switchNetwork(): Promise<void> {
    throw new Error('Unsupported');
  }
  async sendBitcoin(toAddress: string, satoshis: number): Promise<string> {
    const provider = this.getProvider();
    const { result } = await provider.request('sendTransfer', {
      recipients: [{ address: toAddress, amount: satoshis }],
    });
    console.log('🚀 ~ XverseConnector ~ sendBitcoin ~ res:', result);
    return result.txid;
  }
  disconnect(): void {
    localStorage.removeItem('btc-connect-xverse-addresses-Mainnet');
    localStorage.removeItem('btc-connect-xverse-addresses-Testnet');
  }
}
