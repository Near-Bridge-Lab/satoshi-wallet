export * from './connector';
export { ConnectProvider } from './context';
export * from './hooks';
export * from './components/btcWalletSelectorContext'
export * from './utils/setupBTCWallet'
export * from './components/hook'
export const getVersion = () => {
  return '__buildVersion';
};

if (typeof window !== 'undefined') {
  (window as any).__PARTICLE_BTC_CONNECT_VERSION = getVersion();
}
