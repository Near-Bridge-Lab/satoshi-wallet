declare type NetworkId = 'mainnet' | 'testnet';
declare type Chain = 'near' | 'btc' | 'solana' | 'ethereum';
declare type TokenMetadata = {
  name: string;
  symbol: string;
  decimals: number;
  icon: string;
};

declare type NFTMetadata = {
  token_id: string;
  owner_id: string;
  contract_id: string;
  metadata: {
    title: string;
    media: string;
    description?: string;
  };
};
