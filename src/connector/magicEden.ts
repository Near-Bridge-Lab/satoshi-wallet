import icon from '../icons/magic-eden.png';
import { type WalletMetadata } from './base';
import { InjectedConnector } from './injected';

export class MagicEdenConnector extends InjectedConnector {
  readonly metadata: WalletMetadata = {
    id: 'magic-eden',
    name: 'MagicEden Wallet',
    icon,
    downloadUrl: 'https://wallet.magiceden.io/',
  };
  constructor() {
    super('magicEden.bitcoin');
  }
}
