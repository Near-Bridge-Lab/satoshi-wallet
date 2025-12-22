import icon from '../icons/gate.svg';
import { type WalletMetadata } from './base';
import { InjectedConnector } from './injected';

export class GateConnector extends InjectedConnector {
  readonly metadata: WalletMetadata = {
    id: 'gate',
    name: 'Gate Wallet',
    icon,
    downloadUrl: 'https://www.gate.io/en/web3',
  };

  constructor() {
    super('gatewallet.bitcoin');
  }

  async sendBitcoin(
    toAddress: string,
    satoshis: number,
    options?: { feeRate: number },
  ): Promise<string> {
    const addresses = await this.getAccounts();
    if (addresses.length === 0) {
      throw new Error(`${this.metadata.name} not connected!`);
    }
    const result = await (window as any).gatewallet.bitcoin.sendBitcoin({
      fromAddress: addresses[0],
      toAddress,
      satoshis,
      options,
    });
    console.log('🚀 ~ GateConnector ~ sendBitcoin ~ result:', result);
    return result;
  }

  async signMessage(signStr: string, type?: 'ecdsa' | 'bip322-simple'): Promise<string> {
    const addresses = await this.getAccounts();
    if (addresses.length === 0) {
      throw new Error(`${this.metadata.name} not connected!`);
    }
    return (window as any).gatewallet.bitcoin.signMessage({
      fromAddress: addresses[0],
      text: signStr,
      type,
    });
  }
}
