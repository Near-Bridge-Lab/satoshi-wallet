export const IS_MAINNET = process.env.NEXT_PUBLIC_NETWORK === 'mainnet';

export const NEAR_TOKEN_CONTRACT = IS_MAINNET ? 'wrap.near' : 'wrap.testnet';

export const BTC_TOKEN_CONTRACT = process.env.NEXT_PUBLIC_BTC_TOKEN_CONTRACT;

export const TOKEN_WHITE_LIST = [
  BTC_TOKEN_CONTRACT,
  NEAR_TOKEN_CONTRACT,
  ...(IS_MAINNET
    ? [
        '31761a152f1e96f966c041291644129144233b0b.factory.bridge.near',
        '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        'usdt.tether-token.near',
        'token.v2.ref-finance.near',
      ]
    : ['deltausdc.testnet', 'usdtt.fakes.testnet']),
];

export const NEAR_RPC_NODES = IS_MAINNET
  ? {
      Lava: 'https://near.lava.build',
      Official: 'https://rpc.mainnet.near.org',
      Fastnear: 'https://mw.rpc.fastnear.com',
      Drpc: 'https://near.drpc.org',
    }
  : {
      Official: 'https://rpc.testnet.near.org',
      // Lava: 'https://near-testnet.lava.build',
      // Drpc: 'https://near-testnet.drpc.org',
    };

const envMap = {
  stg: 'private_mainnet',
  test: 'testnet',
  development: 'dev',
  production: 'mainnet',
} as const;
export const RUNTIME_NETWORK = envMap[process.env.NEXT_PUBLIC_RUNTIME_ENV as keyof typeof envMap];
