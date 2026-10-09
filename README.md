# Sotashi Wallet Monorepo

Sotashi Wallet is an integrated toolkit that enables Bitcoin usage on the NEAR blockchain through the Satoshi protocol. This repository contains two main packages:

- **wallet**: BTC wallet toolkit, providing Bitcoin functionality on the NEAR network
- **app**: Next.js frontend application, showcasing and utilizing BTC wallet features

## Project Structure

```
sotashi-wallet/
├── packages/
│   ├── wallet/        # BTC wallet core functionality
│   └── app/           # Next.js frontend application
```

## Getting Started

### Requirements

- Node.js 22 or later (required by Wrangler)
- pnpm 10.33.4, pinned by the root `packageManager` field

### Installing Dependencies

```bash
# Install all dependencies
pnpm install
```

### Development

```bash
# Start the app development server at http://localhost:3100
pnpm dev

# Watch and rebuild the wallet package
pnpm dev:wallet

# Build the wallet package once
pnpm --filter btc-wallet build

# Lint all packages
pnpm lint
```

## Deployment

The app is deployed to Cloudflare Workers with OpenNext. Pushes to `main` update the production Worker, and every other branch is deployed as a Worker Preview at `https://<branch>.wallet.satoshibridge.top`. See [packages/app](packages/app/README.md#deployment) for the build commands, the Cloudflare setup and how the environment is selected.

## Wallet Features

Sotashi Wallet provides the following main functions:

- BTC and NEAR wallet integration
- Execute BTC deposit operations through the Satoshi bridge
- Retrieve BTC balance
- Calculate deposit amounts and fees
- Withdraw BTC from NEAR to specified bitcoin addresses

## Tech Stack

- Next.js 16 (App Router) and React 19 for the app; the wallet package supports React 17+
- TypeScript
- NEAR Wallet Selector
- Cloudflare Workers (OpenNext) for deployment

## License

This project is licensed under the MIT License.
