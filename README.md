# BTC Wallet

BTC Wallet is a toolkit that enables Bitcoin usage on the NEAR blockchain through the Satoshi protocol.

## Installation

```bash
pnpm install btc-wallet
# or
yarn add btc-wallet
```

## API Reference

### `BtcWalletSelectorContextProvider` and `setupBTCWallet`

Initialize and integrate BTC wallet with NEAR wallet selector.

```typescript
// 1. Setup wallet selector with BTC wallet module
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupBTCWallet } from 'btc-wallet';

const selector = await setupWalletSelector({
  network: 'mainnet', // or 'testnet'
  debug: true,
  modules: [
    setupBTCWallet({
      iconUrl?: string,         // optional: custom wallet icon URL
      deprecated?: boolean,     // optional: mark as deprecated
      autoConnect?: boolean,    // optional: enable auto-connect, defaults to true
      syncLogOut?: boolean,     // optional: sync logout across tabs, defaults to true
      env?: 'mainnet' | 'testnet' | 'private_mainnet' | 'dev' // optional: defaults to NEAR network environment
    }),
    // setup other wallets...
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

### `executeBTCDepositAndAction`

Execute a native BTC deposit to receive corresponding BTC tokens on NEAR through the Satoshi bridge. You must provide either `action` or `amount`, but not both.

```typescript
interface ExecuteBTCDepositAndActionParams<T extends boolean = true> {
  // Option 1: For dApp one-click BTC deposit and action
  action?: {
    receiver_id: string;    // receiver account on NEAR
    amount: string;         // amount to deposit
    msg: string;           // message for the transaction
  };
  
  // Option 2: For direct Satoshi bridge deposit
  amount?: string;         // amount to deposit to Satoshi bridge
  
  // Common optional parameters
  feeRate?: number;        // optional: custom fee rate for the BTC transaction
  fixedAmount?: boolean;   // optional: whether to use fixed amount
  env?: 'mainnet' | 'testnet' | 'private_mainnet' | 'dev'; // optional: defaults to NEAR network environment
  pollResult?: T;         // optional: whether to poll for transaction result
}

// Example 1: dApp one-click BTC deposit
await executeBTCDepositAndAction({
  action: {
    receiver_id: 'account.near',
    amount: '1000000',     // in smallest units
    msg: 'Deposit'
  },
  feeRate: 5
});

// Example 2: Direct Satoshi bridge deposit
await executeBTCDepositAndAction({
  amount: '1000000',       // amount to deposit to Satoshi bridge
  feeRate: 5
});
```

### `getBtcBalance`

Get the native BTC balance for a given Bitcoin address.

```typescript
import { getBtcBalance } from 'btc-wallet';

const balance = await getBtcBalance(address: string);
// Returns balance in satoshis
```

## Requirements

- React 17.0.0 or higher

## License

This project is licensed under the MIT License - see the LICENSE file for details.