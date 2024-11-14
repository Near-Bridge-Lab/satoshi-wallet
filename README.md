# BTC Wallet

BTC Wallet is a toolkit that enables the use of Bitcoin on the NEAR blockchain through the Satoshi protocol. It provides seamless integration for managing Bitcoin transactions and interactions within the NEAR ecosystem.

## Features

- **NEAR Integration**: Leverage the Satoshi protocol to use Bitcoin on the NEAR blockchain.

## Installation

Install `btc-wallet` using npm or yarn:

```bash
pnpm install btc-wallet
or
yarn add btc-wallet
```

## Usage

### Initialize BTC Wallet

To use BTC Wallet in your project, wrap your application with the `BtcWalletSelectorContextProvider`:

```javascript
import BtcWalletSelectorContextProvider from 'btc-wallet';
function App() {
  return (
    <BtcWalletSelectorContextProvider>
      {/* Your application components */}
    </BtcWalletSelectorContextProvider>
  );
}
```

### Setup Wallet Selector

Integrate BTC Wallet with NEAR's wallet selector:

```javascript
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupBTCWallet } from 'btc-wallet';
setupWalletSelector({
  network: 'mainnet', // or 'testnet'
  modules: [setupBTCWallet()],
});
```

### Execute Burrow Supply

To execute a Burrow supply operation, use the `executeBurrowSupply` function:

```javascript
import { executeBurrowSupply } from 'btc-wallet';
executeBurrowSupply({
  amount: '0.01', // BTC amount
  environment: 'mainnet', // or 'testnet'
}).then(() => {
  console.log('Burrow supply executed successfully');
}).catch((error) => {
  console.error('Error executing Burrow supply:', error);
});
```
