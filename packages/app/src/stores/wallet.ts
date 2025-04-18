import { create } from 'zustand';

export type WalletState = {
  accountId?: string;
  originalAccountId?: string;
  originalPublicKey?: string;
};

export const useWalletStore = create<WalletState>((set, get) => ({
  accountId: '',
  originalAccountId: '',
  originalPublicKey: '',
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
}

pollUpdateDataFromUrl();

setInterval(pollUpdateDataFromUrl, 10000);
