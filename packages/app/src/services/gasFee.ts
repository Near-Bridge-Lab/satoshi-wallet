import Big from 'big.js';
import { calculateGasStrategy } from '../../../wallet/src/utils/satoshi';
import type { Transaction } from '@near-wallet-selector/core';
import { RUNTIME_NETWORK } from '@/config';
import { nearServices } from './near';
import { safeBig } from '@/utils/big';
import { formatAmount } from '@/utils/format';

interface GasFeeResult {
  nearGasFee: string;
  btcGasFee: string;
  registerFee: string;
}

const nearGasPreTxFee = 0.015; // 1Tgas = 0.0001Ⓝ , pre tx 150Tgas = 0.015Ⓝ

export const gasFeeService = {
  async calculateGasFee(transactions: Transaction[]): Promise<GasFeeResult> {
    const accountId = nearServices.getNearAccountId();
    if (!accountId) throw new Error('Wallet not found');

    const result: GasFeeResult = {
      nearGasFee: '0',
      btcGasFee: '0',
      registerFee: '0',
    };

    try {
      const { gasLimit, useNearPayGas } = await calculateGasStrategy({
        csna: accountId,
        transactions,
        env: RUNTIME_NETWORK,
      });

      if (useNearPayGas) {
        result.nearGasFee = safeBig(nearGasPreTxFee).mul(transactions.length).toFixed();
      } else {
        result.btcGasFee = formatAmount(gasLimit, 8);
      }

      result.registerFee = transactions.reduce((acc, cur) => {
        if (
          cur.actions.some(
            (action) =>
              action.type === 'FunctionCall' && action.params.methodName === 'storage_deposit',
          )
        ) {
          const deposit = Number((cur.actions?.[0] as any)?.params?.deposit || 0);
          acc = safeBig(acc).plus(formatAmount(deposit, 24)).toFixed();
        }
        return acc;
      }, '0');

      return result;
    } catch (error) {
      console.error('calculateGasFee:', error);
      return result;
    }
  },
};
