import request from '@/utils/request';

const refFinanceApi = 'https://api.ref.finance';

export const priceServices = {
  async queryPrices() {
    const res = await request<Record<string, { price: string; symbol: string; decimal: number }>>(
      refFinanceApi + '/list-token-price',
    );
    return res;
  },
};
