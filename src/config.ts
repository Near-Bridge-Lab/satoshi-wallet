export const walletConfig: Record<
  string,
  {
    base_url: string;
    token: string;
    contractId: string;
    walletUrl: string;
  }
> = {
  dev: {
    base_url: 'https://api.dev.satoshibridge.top',
    token: 'nbtc1-nsp.testnet',
    contractId: 'dev1-nsp.testnet',
    walletUrl: 'https://wallet-dev.satoshibridge.top',
  },
  testnet: {
    base_url: 'https://api.testnet.satoshibridge.top',
    token: 'nbtc2-nsp.testnet',
    contractId: 'dev2-nsp.testnet',
    walletUrl: 'https://wallet-test.satoshibridge.top',
  },
  mainnet: {
    base_url: 'https://api.mainnet.satoshibridge.top',
    token: '',
    contractId: '',
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
    'https://near-testnet.lava.build',
    'https://rpc.testnet.near.org',
    'https://near-testnet.drpc.org',
  ],
};

export const btcRpcUrls = {
  mainnet: 'https://blockstream.info/api',
  testnet: 'https://blockstream.info/testnet/api',
};
