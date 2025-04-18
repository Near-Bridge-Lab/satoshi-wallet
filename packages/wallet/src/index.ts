export * from './connector';
export { ConnectProvider } from './context';
export * from './hooks';
export * from './core/btcWalletSelectorContext';
export * from './core/setupBTCWallet/index';
export * from './core/btcUtils';
export * from './config';
export * from './core/setupModal';
export const getVersion = () => {
  return '__buildVersion';
};

if (typeof window !== 'undefined') {
  (window as any).__BTC_WALLET_VERSION = getVersion();
}
