import { create } from 'zustand';

export type WalletState = {
  accountId?: string;
  originalAccountId?: string;
  originalPublicKey?: string;
  isNearWallet?: boolean;
};

export const useWalletStore = create<WalletState>((set, get) => ({
  accountId: '',
  originalAccountId: '',
  originalPublicKey: '',
  isNearWallet: false,
}));

function pollUpdateDataFromUrl() {
  if (typeof window === 'undefined') return;
  const urlParams = new URLSearchParams(window.location.search);
  const accountId = urlParams.get('accountId');
  const originalAccountId = urlParams.get('originalAccountId');
  const originalPublicKey = urlParams.get('originalPublicKey');
  if (accountId) useWalletStore.setState({ accountId });
  if (originalAccountId) useWalletStore.setState({ originalAccountId });
  if (originalPublicKey) useWalletStore.setState({ originalPublicKey });
  if (accountId && !(originalAccountId && originalPublicKey)) {
    useWalletStore.setState({ isNearWallet: true });
  }
}

pollUpdateDataFromUrl();

setInterval(pollUpdateDataFromUrl, 10000);
