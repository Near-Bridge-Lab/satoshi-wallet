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
}
