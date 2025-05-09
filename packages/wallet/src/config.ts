export type ENV = 'mainnet' | 'testnet' | 'private_mainnet' | 'dev';

export const walletConfig: Record<
  ENV,
  {
    base_url: string;
    btcToken: string;
    btcTokenDecimals: number;
    nearToken: string;
    nearTokenDecimals: number;
    accountContractId: string;
    bridgeContractId: string;
    walletUrl: string;
    bridgeUrl: string;
  }
> = {
  dev: {
    base_url: 'https://api.dev.satoshibridge.top',
    btcToken: 'nbtc-dev.testnet',
    btcTokenDecimals: 8,
    nearToken: 'wrap.testnet',
    nearTokenDecimals: 24,
    accountContractId: 'acc-dev.testnet',
    bridgeContractId: 'brg-dev.testnet',
    walletUrl: 'https://wallet-dev.satoshibridge.top',
    bridgeUrl: 'https://dev.satoshibridge.top/',
  },
  testnet: {
    base_url: 'https://api.testnet.satoshibridge.top',
    btcToken: 'nbtc2-nsp.testnet',
    btcTokenDecimals: 8,
    nearToken: 'wrap.testnet',
    nearTokenDecimals: 24,
    accountContractId: 'acc2-nsp.testnet',
    bridgeContractId: 'brg2-nsp.testnet',
    walletUrl: 'https://wallet-test.satoshibridge.top',
    bridgeUrl: 'https://testnet.satoshibridge.top/',
  },
  private_mainnet: {
    base_url: 'https://api.stg.satoshibridge.top',
    btcToken: 'nbtc.toalice.near',
    btcTokenDecimals: 8,
    nearToken: 'wrap.near',
    nearTokenDecimals: 24,
    accountContractId: 'acc.toalice.near',
    bridgeContractId: 'brg.toalice.near',
    walletUrl: 'https://wallet-stg.satoshibridge.top',
    bridgeUrl: 'https://old.ramp.satos.network',
  },
  mainnet: {
    base_url: 'https://api.satos.network',
    btcToken: 'nbtc.bridge.near',
    btcTokenDecimals: 8,
    nearToken: 'wrap.near',
    nearTokenDecimals: 24,
    accountContractId: 'acc.ref-labs.near',
    bridgeContractId: 'btc-connector.bridge.near',
    walletUrl: 'https://wallet.satoshibridge.top',
    bridgeUrl: 'https://ramp.satos.network',
  },
};

export function getWalletConfig(env: ENV) {
  const config = walletConfig[env];
  const network = env === 'mainnet' || env === 'private_mainnet' ? 'mainnet' : 'testnet';
  return {
    ...config,
    network,
  };
}

export const nearRpcUrls = {
  mainnet: [
    'https://near.lava.build',
    'https://rpc.mainnet.near.org',
    'https://free.rpc.fastnear.com',
    'https://near.drpc.org',
  ],
  testnet: ['https://rpc.testnet.near.org'],
};

export const btcRpcUrls = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet/api',
};
