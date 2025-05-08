import { storageStore } from '../../utils';

const STORAGE_KEYS = {
  ACCOUNT: 'btc-wallet-account',
  PUBLIC_KEY: 'btc-wallet-publickey',
  BTC_PUBLIC_KEY: 'btc-wallet-btc-publickey',
} as const;

const storage = storageStore('SATOSHI_WALLET_ACCOUNT');

export default {
  saveAccount(account: string) {
    if (!account) {
      this.removeAccount();
      return;
    }
    storage?.set(STORAGE_KEYS.ACCOUNT, account);
  },
  removeAccount() {
    storage?.remove(STORAGE_KEYS.ACCOUNT);
  },
  savePublicKey(publicKey: string) {
    if (!publicKey) {
      this.removePublicKey();
      return;
    }
    storage?.set(STORAGE_KEYS.PUBLIC_KEY, publicKey);
  },
  removePublicKey() {
    storage?.remove(STORAGE_KEYS.PUBLIC_KEY);
  },
  saveBtcPublicKey(publicKey: string) {
    if (!publicKey) {
      this.removeBtcPublicKey();
      return;
    }
    storage?.set(STORAGE_KEYS.BTC_PUBLIC_KEY, publicKey);
  },
  removeBtcPublicKey() {
    storage?.remove(STORAGE_KEYS.BTC_PUBLIC_KEY);
  },
  clear() {
    this.removeAccount();
    this.removePublicKey();
    this.removeBtcPublicKey();
  },
  save(account: string, publicKey: string) {
    if (!account || !publicKey) {
      this.clear();
      return;
    }
    this.saveAccount(account);
    this.savePublicKey(publicKey);
  },
  getAccount() {
    return storage?.get<string>(STORAGE_KEYS.ACCOUNT) || '';
  },
  getPublicKey() {
    return storage?.get<string>(STORAGE_KEYS.PUBLIC_KEY) || '';
  },
  getBtcPublicKey() {
    return storage?.get<string>(STORAGE_KEYS.BTC_PUBLIC_KEY) || '';
  },
  isValid() {
    const account = this.getAccount();
    const publicKey = this.getPublicKey();
    const btcPublicKey = this.getBtcPublicKey();

    const allEmpty = !account && !publicKey && !btcPublicKey;
    const allExist = account && publicKey && btcPublicKey;

    return allEmpty || allExist;
  },
  syncSave(account: string, publicKey: string, btcPublicKey: string) {
    if (!account || !publicKey || !btcPublicKey) {
      this.clear();
      return;
    }

    this.clear();

    this.savePublicKey(publicKey);
    this.saveBtcPublicKey(btcPublicKey);
    this.saveAccount(account);
  },
};
