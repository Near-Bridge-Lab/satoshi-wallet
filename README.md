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
import { setupBTCWallet, setupWalletSelectorModal } from 'btc-wallet';

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

// 2. Setup wallet selector modal,params see setupModal @near-wallet-selector/modal-ui
setupWalletSelectorModal(selector, {
  contractId:'xxx.near',
});

// 3. Wrap your app with BtcWalletSelectorContextProvider
import { BtcWalletSelectorContextProvider } from 'btc-wallet';
import '@near-wallet-selector/modal-ui/styles.css';

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
  env?: 'mainnet' | 'testnet' | 'private_mainnet' | 'dev'; // optional: defaults to NEAR network environment
  pollResult?: T;         // optional: whether to poll for transaction result
  registerDeposit?: string; // optional: whether to register deposit,default 0.000125 NEAR
  newAccountMinDepositAmount?: boolean; // default is true, if true, new account minimum deposit BTC amount 1000sat, otherwise 0
  registerContractId?: string; // if registerContractId is provided, it will be used to register the contract, otherwise it will be the default contract id
}

// Example 1: dApp one-click BTC deposit
await executeBTCDepositAndAction({
  action: {
    receiver_id: 'token.near',
    amount: '1000000',
    msg: 'ft_transfer_call message' // ft_transfer_call message
  },
  registerDeposit: '100000000000000000000000',  // default 0.000125 NEAR, you can set it according to your needs
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

const balance = await getBtcBalance(address: string, option?: {
  /** if csna is provided, available balance will be calculated protocol fee and repay amount */
  csna?: string;
  env?: ENV;
});
// Returns balance in satoshis
```

### `getDepositAmount`

Calculate the amount of BTC tokens that can be received on NEAR after depositing native BTC through Satoshi Bridge. This takes into account bridge fees and minimum deposit requirements.

```typescript
import { getDepositAmount } from 'btc-wallet';

// Calculate receivable amount
const result = await getDepositAmount(
  amount: string,           // Amount in satoshi units
  options?: {
    env?: 'mainnet' | 'testnet' | 'private_mainnet' | 'dev', // Optional: Defaults to NEAR network environment
    newAccountMinDepositAmount?: boolean  // default is true, if true, new account minimum deposit amount 1000sat, otherwise 0
  }
);

// Returns
interface DepositAmountResult {
  depositAmount: number;            // Original deposit amount
  totalDepositAmount: number;       // Total amount needed including all fees
  protocolFee: number;             // Protocol fee
  repayAmount: number;             // Amount to repay if there's debt
  newAccountMinDepositAmount: number; // Minimum deposit amount for new accounts
}

To complete the deposit, you will need to send `totalDepositAmount` of BTC, which includes:
- Original deposit amount
- Protocol fees
- Repayment amount (if you have existing debt)
- New account minimum deposit (for first-time users)
```

### `getWithdrawTransaction`

Get transaction for withdrawing BTC from NEAR to a specified bitcoin address.

```typescript
import { getWithdrawTransaction } from 'btc-wallet';

const transaction = await getWithdrawTransaction({
  btcAddress: string,      // Target bitcoin address
  amount: string,          // Amount to withdraw in satoshi units
  env?: 'mainnet' | 'testnet' | 'private_mainnet' | 'dev' // Optional: Defaults to NEAR network environment
});
```

## Requirements

- React 17.0.0 or higher

## License

This project is licensed under the MIT License - see the LICENSE file for details.