import request from '@/utils/request';

const refFinanceApi = 'https://api.ref.finance';

export const priceServices = {
  async queryPrices() {
    const res = await request<Record<string, { price: string; symbol: string; decimal: number }>>(
      refFinanceApi + '/list-token-price',
    );
    const prices = Object.fromEntries(
      Object.values(res).map(({ price, symbol }) => [symbol, price]),
    );
    prices['NEAR'] = prices['wNEAR'];
    prices['WETH'] = prices['ETH'];
    prices['BTC'] = prices['WBTC'];
    prices['NBTC'] = prices['WBTC'];
    return prices;
  },
};
