export * from './connector';
export { ConnectProvider } from './context';
export * from './hooks';
export * from './core/btcWalletSelectorContext';
export * from './core/setupBTCWallet';
export * from './core/btcUtils';
export const getVersion = () => {
  return '__buildVersion';
};

if (typeof window !== 'undefined') {
  (window as any).__BTC_WALLET_VERSION = getVersion();
}
