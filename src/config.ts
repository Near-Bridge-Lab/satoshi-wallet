export type ENV = 'mainnet' | 'testnet' | 'private_mainnet' | 'dev';

export const walletConfig: Record<
  ENV,
  {
    base_url: string;
    token: string;
    accountContractId: string;
    bridgeContractId: string;
    walletUrl: string;
    bridgeUrl: string;
  }
> = {
  dev: {
    base_url: 'https://api.dev.satoshibridge.top',
    token: 'nbtc-dev.testnet',
    accountContractId: 'acc-dev.testnet',
    bridgeContractId: 'brg-dev.testnet',
    walletUrl: 'https://wallet-dev.satoshibridge.top',
    bridgeUrl: 'https://dev.satoshibridge.top/',
  },
  testnet: {
    base_url: 'https://api.testnet.satoshibridge.top',
    token: 'nbtc2-nsp.testnet',
    accountContractId: 'acc2-nsp.testnet',
    bridgeContractId: 'brg2-nsp.testnet',
    walletUrl: 'https://wallet-test.satoshibridge.top',
    bridgeUrl: 'https://testnet.satoshibridge.top/',
  },
  private_mainnet: {
    base_url: 'https://api.stg.satoshibridge.top',
    token: 'nbtc.toalice.near',
    accountContractId: 'acc.toalice.near',
    bridgeContractId: 'brg.toalice.near',
    walletUrl: 'https://wallet-stg.satoshibridge.top',
    bridgeUrl: 'https://stg.satoshibridge.top/',
  },
  mainnet: {
    base_url: 'https://api.mainnet.satoshibridge.top',
    token: 'nbtc.toalice.near',
    accountContractId: 'acc.toalice.near',
    bridgeContractId: 'brg.toalice.near',
    walletUrl: 'https://wallet.satoshibridge.top',
    bridgeUrl: 'https://www.satoshibridge.top/',
  },
};

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
