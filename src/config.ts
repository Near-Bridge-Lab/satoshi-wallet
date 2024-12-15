export const walletConfig: Record<
  string,
  {
    base_url: string;
    token: string;
    accountContractId: string;
    bridgeContractId: string;
    walletUrl: string;
  }
> = {
  dev: {
    base_url: 'https://api.dev.satoshibridge.top',
    token: 'nbtc-dev.testnet',
    accountContractId: 'acc-dev.testnet',
    bridgeContractId: 'brg-dev.testnet',
    walletUrl: 'https://wallet-dev.satoshibridge.top',
  },
  testnet: {
    base_url: 'https://api.testnet.satoshibridge.top',
    token: 'nbtc2-nsp.testnet',
    accountContractId: 'dev2-nsp.testnet',
    bridgeContractId: 'brg2-nsp.testnet',
    walletUrl: 'https://wallet-test.satoshibridge.top',
  },
  mainnet: {
    base_url: 'https://api.mainnet.satoshibridge.top',
    token: '',
    accountContractId: '',
    bridgeContractId: '',
    walletUrl: 'https://wallet.satoshibridge.top',
  },
};

export const nearRpcUrls = {
  mainnet: [
    'https://near.lava.build',
    'https://rpc.mainnet.near.org',
    'https://free.rpc.fastnear.com',
    'https://near.drpc.org',
  ],
  testnet: [
    'https://rpc.testnet.near.org',
    'https://near-testnet.lava.build',
    'https://near-testnet.drpc.org',
  ],
};

export const btcRpcUrls = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet/api',
};
