import Big from 'big.js';
import { safeBig } from './big';
Big.DP = 24;

export function formatValidNumber(val: string | number | undefined, maxDecimals = 8) {
  if (!val) return;
  let value = val?.toString().replace(/[^\d.]/g, '');
  const dots = value?.match(/\./g)?.length || 0;
  if (dots > 1) return;
  value = value?.replace(/^0+(\d)/, '$1');
  if (value === '.') {
    value = '0.';
  }
  if (value?.includes('.')) {
    const [integer, decimal] = value.split('.');
    if (decimal.length > maxDecimals) {
      return `${integer}.${decimal.slice(0, maxDecimals)}`;
    }
  }
  return value;
}

export function formatSortAddress(address: string | undefined) {
  if (!address) return '';
  const maxLength = 15;

  if (address.length <= maxLength) {
    return address;
  }
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

interface FormatNumberOptions {
  rm?: Big.RoundingMode;
  displayMinimum?: boolean;
  maxDigits?: number;
  useUnit?: boolean;
}

export function formatNumber(val: string | number | undefined, options?: FormatNumberOptions) {
  if (!val || !Number(val)) return '0';
  const { rm = Big.roundHalfUp, displayMinimum = true, useUnit = false } = options || {};

  const bigVal = new Big(val);

  // Use getPriceDecimals for consistent decimal calculation
  let maxDigits = options?.maxDigits;
  if (maxDigits === undefined) {
    const absVal = bigVal.abs();
    if (absVal.eq(0)) {
      maxDigits = 0;
    } else {
      maxDigits = getPriceDecimals(absVal.toFixed());
    }
  }

  if (useUnit) {
    if (bigVal.gte(1e9)) {
      return new Big(bigVal.div(1e9)).round(1).toString() + 'B';
    }
    if (bigVal.gte(1e6)) {
      return new Big(bigVal.div(1e6)).round(1).toString() + 'M';
    }
    if (bigVal.gte(1e3)) {
      return new Big(bigVal.div(1e3)).round(1).toString() + 'K';
    }
  }

  const min = new Big(10).pow(-maxDigits);
  const roundedVal = bigVal.round(maxDigits, rm);

  if (displayMinimum && roundedVal.abs().lt(min)) {
    const formattedMin = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      maximumFractionDigits: maxDigits,
    }).format(min.toNumber());

    return `< ${roundedVal.lt(0) ? '-' : ''}${formattedMin}`;
  }

  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'decimal',
    maximumFractionDigits: maxDigits,
  }).format(roundedVal.toNumber());

  return formattedValue;
}

const subscriptNumbers = [
  '₀',
  '₁',
  '₂',
  '₃',
  '₄',
  '₅',
  '₆',
  '₇',
  '₈',
  '₉',
  '₁₀',
  '₁₁',
  '₁₂',
  '₁₃',
  '₁₄',
  '₁₅',
  '₁₆',
  '₁₇',
  '₁₈',
  '₁₉',
  '₂₀',
];

export function formatNumberWithSubscript(value: string | number): string {
  const strVal = value.toString();
  const parts = strVal.split('.');
  if (parts.length <= 1) return strVal;

  const leadingZeros = parts[1].match(/^0+/)?.[0]?.length || 0;
  const absVal = new Big(value).abs();

  let maxDigits;
  if (absVal.eq(0)) {
    maxDigits = 0;
  } else {
    maxDigits = getPriceDecimals(absVal.toFixed());
  }

  if (leadingZeros > 3 && leadingZeros <= 20) {
    const remainingDigits = parts[1]?.slice(leadingZeros);
    // When using subscript, display a fixed 5 digits since subscript already compresses the length
    const digitsToShow = maxDigits - leadingZeros;
    const truncatedDigits = remainingDigits?.slice(0, digitsToShow).replace(/0+$/, '');
    const subscriptNumber = subscriptNumbers[leadingZeros];
    parts[1] = '0' + subscriptNumber + truncatedDigits;
  } else {
    parts[1] = parts[1]?.slice(0, maxDigits).replace(/0+$/, '');
  }

  return parts.join('.');
}

export function formatPrice(
  price: string | number | undefined,
  options?: FormatNumberOptions & { showSign?: boolean },
) {
  const bigPrice = safeBig(price);
  const formattedPrice = bigPrice.eq(0)
    ? '0'
    : bigPrice.lt(1)
      ? formatNumberWithSubscript(price || 0)
      : formatNumber(price, options);
  const prefix = options?.showSign ? '$' : '';
  if (formattedPrice.startsWith('-')) return '-' + prefix + formattedPrice?.slice(1);
  return prefix + formattedPrice;
}

export function formatAmount(amount: string | number | undefined, decimals = 24) {
  if (!amount) return '';
  try {
    const n = new Big(amount).div(Big(10).pow(decimals)).toFixed();
    return n;
  } catch (error) {
    return '';
  }
}

export function formatFileUrl(key: string) {
  return `${process.env.NEXT_PUBLIC_AWS_S3_URL}${key}`;
}

export function formatToken(symbol?: string) {
  // if (symbol === 'NBTC') return 'BTC';
  return symbol;
}

export function parseAmount(amount: string | number | undefined, decimals = 24) {
  if (!amount) return '';
  try {
    return new Big(amount).times(Big(10).pow(decimals)).toFixed(0, Big.roundDown);
  } catch (error) {
    return '';
  }
}

const explorerUrl = {
  BTC:
    process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
      ? 'https://mempool.space'
      : 'https://mempool.space/testnet',
  NEAR:
    process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
      ? 'https://nearblocks.io'
      : 'https://testnet.nearblocks.io',
};

export function formatExplorerUrl(
  chain: 'BTC' | 'NEAR',
  val: string,
  type: 'account' | 'transaction' = 'transaction',
) {
  switch (chain) {
    case 'BTC':
      return (explorerUrl[chain] ?? '') + `/${type === 'account' ? 'address' : 'tx'}/${val}`;
    case 'NEAR':
      return (explorerUrl[chain] ?? '') + `/${type === 'account' ? 'address' : 'txns'}/${val}`;
  }
}

export function getPriceDecimals(price?: string | number, maxDecimals?: number) {
  if (!price || !Number(price)) return maxDecimals || 15;
  const priceNum = Number(price);

  let decimals: number;
  if (priceNum >= 10) {
    decimals = 2;
  } else if (priceNum >= 1) {
    decimals = 3;
  } else {
    const match = priceNum.toFixed(20).match(/^0\.0*/);
    const leadingZeros = match ? match[0].length - 2 : 0;
    decimals = leadingZeros + 4;
  }

  return maxDecimals ? Math.min(decimals, maxDecimals) : Math.min(decimals, 18);
}
