const STORAGE_KEYS = {
  ACCOUNT: 'btc-wallet-account',
  PUBLIC_KEY: 'btc-wallet-publickey',
  BTC_PUBLIC_KEY: 'btc-wallet-btc-publickey',
} as const;

export default {
  saveAccount(account: string) {
    if (!account) {
      this.removeAccount();
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.ACCOUNT, account);
  },
  removeAccount() {
    window.localStorage.removeItem(STORAGE_KEYS.ACCOUNT);
  },
  savePublicKey(publicKey: string) {
    if (!publicKey) {
      this.removePublicKey();
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.PUBLIC_KEY, publicKey);
  },
  removePublicKey() {
    window.localStorage.removeItem(STORAGE_KEYS.PUBLIC_KEY);
  },
  saveBtcPublicKey(publicKey: string) {
    if (!publicKey) {
      this.removeBtcPublicKey();
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.BTC_PUBLIC_KEY, publicKey);
  },
  removeBtcPublicKey() {
    window.localStorage.removeItem(STORAGE_KEYS.BTC_PUBLIC_KEY);
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
    return window.localStorage.getItem(STORAGE_KEYS.ACCOUNT) || '';
  },
  getPublicKey() {
    return window.localStorage.getItem(STORAGE_KEYS.PUBLIC_KEY) || '';
  },
  getBtcPublicKey() {
    return window.localStorage.getItem(STORAGE_KEYS.BTC_PUBLIC_KEY) || '';
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
