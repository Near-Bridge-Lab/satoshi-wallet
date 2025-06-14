import EventEmitter from 'events';
import type {
  Address,
  GetAddressOptions,
  SendBtcTransactionOptions,
  SignMessageOptions,
} from 'sats-connect';
import icon from '../icons/magicEden.svg';
import { BaseConnector, type WalletMetadata } from './base';
import { storageStore } from '../utils';

const storage = storageStore('SATOSHI_WALLET_MAGICEDEN');
export class MagicEdenConnector extends BaseConnector {
  #network = 'Mainnet';
  #event = new EventEmitter();

  constructor() {
    super();
    this.#event.setMaxListeners(100);
  }

  readonly metadata: WalletMetadata = {
    id: 'magicEden',
    name: 'Magic Eden Wallet',
    icon,
    downloadUrl: 'https://www.magiceden.io',
  };

  isReady(): boolean {
    return typeof window !== 'undefined' && 'magicEden' in window && !!window.magicEden;
  }

  private loadAccounts = async (network: 'Mainnet' | 'Testnet') => {
    const { getAddress, AddressPurpose } = await import('sats-connect');
    const addresses = await new Promise<Address[]>((resolve, reject) => {
      const getAddressOptions: GetAddressOptions = {
        payload: {
          purposes: [AddressPurpose.Payment, AddressPurpose.Ordinals],
          message: 'Address for receiving Ordinals and payments',
          network: {
            type: network as any,
          },
        },
        onFinish: (response) => {
          resolve(response.addresses);
        },
        onCancel: () =>
          reject({
            code: 4001,
            message: 'User rejected the request.',
          }),
      };
      getAddress(getAddressOptions).catch((error) => reject(error));
    });
    storage?.set(`${network}:addresses`, addresses);
    return addresses;
  };

  async sendInscription(): Promise<{ txid: string }> {
    throw new Error('Unsupported');
  }

  async requestAccounts(): Promise<string[]> {
    if (!this.isReady()) {
      throw new Error(`${this.metadata.name} is not install!`);
    }
    const addresses = await this.loadAccounts(this.#network as any);
    return addresses.map((item) => item.address);
  }

  async getAccounts(): Promise<string[]> {
    if (!this.isReady()) {
      throw new Error(`${this.metadata.name} is not install!`);
    }
    const data = storage?.get<Address[]>(`${this.#network}:addresses`);
    if (data) {
      return data.map((item) => item.address);
    } else {
      return [];
    }
  }

  async getPublicKey(): Promise<string> {
    if (!this.isReady()) {
      throw new Error(`${this.metadata.name} is not install!`);
    }
    const data = storage?.get<Address[]>(`${this.#network}:addresses`);
    if (data) {
      return data[0].publicKey;
    } else {
      return '';
    }
  }

  async signMessage(signStr: string): Promise<string> {
    if (!this.isReady()) {
      throw new Error(`${this.metadata.name} is not install!`);
    }
    const addresses = await this.getAccounts();
    if (addresses.length === 0) {
      throw new Error(`${this.metadata.name} not connected!`);
    }
    const { signMessage } = await import('sats-connect');

    const sig = await new Promise<string>((resolve, reject) => {
      const signMessageOptions: SignMessageOptions = {
        payload: {
          network: {
            type: this.#network as any,
          },
          address: addresses[0],
          message: signStr,
        },
        onFinish: (response) => {
          resolve(response);
        },
        onCancel: () => {
          reject({
            code: 4001,
            message: 'User rejected the request.',
          });
        },
      };
      signMessage(signMessageOptions).catch((e) => {
        reject(e);
      });
    });

    const modifiedSig = Buffer.from(sig, 'base64');
    modifiedSig[0] = 31 + ((modifiedSig[0] - 31) % 4);
    return modifiedSig.toString('base64');
  }

  on(event: string, handler: (data?: unknown) => void) {
    return this.#event.on(event, handler);
  }

  removeListener(event: string, handler: (data?: unknown) => void) {
    return this.#event.removeListener(event, handler);
  }

  getProvider() {
    if (this.isReady()) {
      if ('magicEden' in window) {
        const anyWindow: any = window;
        if (anyWindow.magicEden.bitcoin && anyWindow.magicEden.bitcoin.isMagicEden)
          return anyWindow.magicEden.bitcoin;
      }
    }
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
    if (!provider) {
      throw new Error(`${this.metadata.name} is not install!`);
    }
    const { sendBtcTransaction } = await import('sats-connect');

    const addresses = await this.getAccounts();
    if (addresses.length === 0) {
      throw new Error(`${this.metadata.name} not connected!`);
    }
    const result = await new Promise<any>((resolve, reject) => {
      const sendBtcOptions: SendBtcTransactionOptions = {
        payload: {
          network: {
            type: this.#network as any,
          },
          recipients: [
            {
              address: toAddress,
              amountSats: BigInt(satoshis),
            },
          ],
          senderAddress: addresses[0],
        },
        onFinish: (response) => {
          resolve(response);
        },
        onCancel: () => {
          reject({
            code: 4001,
            message: 'User rejected the request.',
          });
        },
      };
      sendBtcTransaction(sendBtcOptions).catch((e) => reject(e));
    });
    return result?.txid || result;
  }

  disconnect(): void {
    storage?.remove(`${this.#network}:addresses`);
  }
}
