import icon from '../icons/binance.png';
import { type WalletMetadata } from './base';
import { InjectedConnector } from './injected';

export class BinanceConnector extends InjectedConnector {
  readonly metadata: WalletMetadata = {
    id: 'binance',
    name: 'Binance Wallet',
    icon,
    downloadUrl: 'https://www.binance.com/en/web3wallet',
  };
  constructor() {
    super('binancew3w.bitcoin');
  }
}
