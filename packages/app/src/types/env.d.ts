declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_RUNTIME_ENV: 'development' | 'test' | 'stg' | 'production';
    NEXT_PUBLIC_NETWORK: NetworkId;

    NEXT_PUBLIC_AWS_S3_URL: string;
    NEXT_PUBLIC_URL: string;
    NEXT_PUBLIC_API_URL: string;
    NEXT_PUBLIC_BTC_TOKEN_CONTRACT: string;
    NEXT_PUBLIC_NEAR_SWAP_API: string;
    NEXT_PUBLIC_NEAR_SWAP_CONTRACT: string;
  }
}
