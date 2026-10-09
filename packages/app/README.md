# Sotashi Wallet App

Sotashi Wallet App is a frontend application built with Next.js that integrates the Sotashi BTC wallet functionality, allowing users to use Bitcoin on the NEAR blockchain.

## Features

- Integrated NEAR and BTC wallets
- Cross-chain operations via the Satoshi protocol
- Deposit and withdrawal functionality
- Account management and balance queries

## Getting Started

Run the development server from the monorepo root or from `packages/app`:

```bash
pnpm dev
```

Open [http://localhost:3100](http://localhost:3100) with your browser to see the result.

The pages live in `src/app` (Next.js App Router) and auto-update as you edit the files.

## Environments

Each environment has its own env file in this directory, and `NEXT_PUBLIC_RUNTIME_ENV` selects the wallet network:

| Environment                                 | Env file           | `NEXT_PUBLIC_RUNTIME_ENV` | Wallet network    |
| ------------------------------------------- | ------------------ | ------------------------- | ----------------- |
| Production (`main`)                         | `.env`             | `production`              | `mainnet`         |
| Staging (every other Workers Builds branch) | `.env.stg`         | `stg`                     | `private_mainnet` |
| Test                                        | `.env.test`        | `test`                    | `testnet`         |
| Development (`pnpm dev`)                    | `.env.development` | `development`             | `dev`             |

`next.config.mjs` picks the env file for a build:

- `BUILD_ENV=<name>` loads `.env.<name>`, for example `BUILD_ENV=test pnpm build:cloudflare` builds against testnet.
- Otherwise, Workers Builds loads `.env.stg` for every branch except `main` (it reads `WORKERS_CI_BRANCH`).
- Otherwise, `.env` is used.

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

The app runs on Cloudflare Workers through [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) (Node.js runtime, static assets incremental cache, so no KV, R2 or D1 binding is needed). The Worker is named `satoshi-wallet` in `wrangler.jsonc`.

### Build and preview locally

```bash
# Build the Worker bundle into packages/app/.open-next
pnpm build:cloudflare

# Serve the build on workerd at http://localhost:8787
pnpm --filter @satoshi-wallet/app preview:cloudflare
```

`pnpm deploy:cloudflare` publishes a build to Cloudflare and is meant to run on CI.

### Cloudflare setup

The Worker is connected to this repository through Workers Builds:

| Setting                                  | Value                                                     |
| ---------------------------------------- | --------------------------------------------------------- |
| Production branch                        | `main`                                                    |
| Root directory                           | `/`                                                       |
| Build command                            | `pnpm build:cloudflare`                                   |
| Deploy command (production branch)       | `pnpm deploy:cloudflare`                                  |
| Non-production command (Worker Previews) | `pnpm --filter @satoshi-wallet/app exec wrangler preview` |

- `main` updates the production Worker, which serves `https://wallet.satos.network`.
- Every other branch is deployed as a Worker Preview at `https://<branch>.wallet.satoshibridge.top`, where `/` in the branch name becomes `-`: `stg` is served at `https://stg.wallet.satoshibridge.top` and `feat/foo` at `https://feat-foo.wallet.satoshibridge.top`.
- `wrangler.jsonc` must keep its empty `previews` block, which `wrangler preview` requires.

### Response headers

Responses carry `X-Content-Type-Options`, `Referrer-Policy` and `Access-Control-Allow-Origin`. Cloudflare serves static assets without invoking the Worker, so the headers are defined twice and must be kept in sync: `headers()` in `next.config.mjs` covers the responses rendered by the Worker, and the `/*` rule in `public/_headers` covers the static assets.

### Version constraints

- Next.js is pinned to 16.3.8. `@opennextjs/cloudflare@1.20.9` does not inline the `preview-props.json` manifest that Next.js 16.4.0 emits, which makes every server-rendered route fail ([opennextjs-cloudflare#1355](https://github.com/opennextjs/opennextjs-cloudflare/issues/1355)). Bump it once the adapter ships the fix.
- pnpm is pinned to 10.33.4 through the root `packageManager` field. pnpm 9 and pnpm 10 compute the lockfile checksum of `pnpm.packageExtensions` differently, so `pnpm install --frozen-lockfile` fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` on other major versions.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
