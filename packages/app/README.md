# Sotashi Wallet App

Sotashi Wallet App is a frontend application built with Next.js that integrates the Sotashi BTC wallet functionality, allowing users to use Bitcoin on the NEAR blockchain.

## Features

- Integrated NEAR and BTC wallets
- Cross-chain operations via the Satoshi protocol
- Deposit and withdrawal functionality
- Account management and balance queries

## Getting Started

First, run the development server:

```bash
# In the monorepo root directory
pnpm --filter app dev
# Or in the app directory
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the pages by modifying files in the `src/pages` directory. The pages auto-update as you edit the files.

## BTC Wallet Integration

This application integrates the Sotashi BTC wallet, providing the following API:

```typescript
// 1. Setup wallet selector with BTC wallet module
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupBTCWallet, setupWalletSelectorModal } from 'btc-wallet';

const selector = await setupWalletSelector({
  network: 'mainnet', // or 'testnet'
  modules: [
    setupBTCWallet({
      // configuration options...
    }),
  ],
});

// 2. Wrap your app with BtcWalletSelectorContextProvider
import { BtcWalletSelectorContextProvider } from 'btc-wallet';

function App() {
  return (
    <BtcWalletSelectorContextProvider>
      {/* Your application components */}
    </BtcWalletSelectorContextProvider>
  );
}
```

### Main Functions

- **Deposits**: Execute BTC deposit operations using `executeBTCDepositAndAction`
- **Balance Queries**: Get BTC balance with `getBtcBalance`
- **Deposit Amount Calculation**: Calculate deposit amounts and fees with `getDepositAmount`
- **Withdrawals**: Create withdrawal transactions with `getWithdrawTransaction`

## Deployment

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
