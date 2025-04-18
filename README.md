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

### Installing Dependencies

```bash
# Install all dependencies
pnpm install
```

### Development

```bash
# Start the app development server
pnpm --filter app dev

# Build the wallet package
pnpm --filter wallet build
```

## Wallet Features

Sotashi Wallet provides the following main functions:

- BTC and NEAR wallet integration
- Execute BTC deposit operations through the Satoshi bridge
- Retrieve BTC balance
- Calculate deposit amounts and fees
- Withdraw BTC from NEAR to specified bitcoin addresses

## Tech Stack

- React 17.0.0+
- Next.js
- TypeScript
- NEAR Wallet Selector

## License

This project is licensed under the MIT License - see the LICENSE file for details. 