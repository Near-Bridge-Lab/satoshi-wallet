import { NEAR_TOKEN_CONTRACT } from '@/config';
import request from '@/utils/request';

const refFinanceApi = 'https://api.ref.finance';

export const priceServices = {
  async queryPrices() {
    const res = await request<Record<string, { price: string; symbol: string; decimal: number }>>(
      refFinanceApi + '/list-token-price',
    );
    res.near = res[NEAR_TOKEN_CONTRACT];
    return res;
  },
};
