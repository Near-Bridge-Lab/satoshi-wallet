import { nearServices } from './near';
import { rpcToWallet } from '@/utils/request';
import { parseAmount } from '@/utils/format';
import { gasFeeService } from './gasFee';
import { useTokenStore } from '@/stores/token';
import { Transaction } from '@near-wallet-selector/core';

interface SendParams {
  token: string;
  recipient: string;
  amount: string;
}

export const sendServices = {
  getAccountType(account: string) {
    if (!account) return null;

    // BTC address patterns
    if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(account)) {
      return 'btc';
    }

    // EVM address pattern (0x + 40 hex chars)
    if (/^0x[a-fA-F0-9]{40}$/.test(account)) {
      return 'evm';
    }

    // NEAR implicit account (64 hex chars)
    if (account.length === 64 && /^[0-9a-f]+$/.test(account)) {
      return 'implicit';
    }

    // NEAR named account
    if (
      /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/.test(account) &&
      account.length >= 2 &&
      account.length <= 64
    ) {
      return 'named';
    }

    return 'invalid';
  },
  async generateTransaction({ token, recipient, amount }: SendParams) {
    const accountId = nearServices.getNearAccountId();
    if (!accountId) throw new Error('Wallet not found');
    const accountType = this.getAccountType(recipient);
    const _recipient = accountType === 'evm' ? recipient.toLowerCase() : recipient;
    const registerTokenTransaction = await nearServices.registerToken(token, _recipient);
    const decimals = useTokenStore.getState().tokenMeta[token]?.decimals;
    const transferTransaction: Transaction =
      token !== 'near'
        ? {
            signerId: accountId,
            receiverId: token,
            actions: [
              ...(registerTokenTransaction?.actions || []),
              {
                type: 'FunctionCall',
                params: {
                  methodName: 'ft_transfer',
                  args: {
                    receiver_id: _recipient,
                    amount: parseAmount(amount, decimals),
                    msg: '',
                  },
                  deposit: '1',
                  gas: parseAmount(100, 12),
                },
              },
            ],
          }
        : {
            signerId: accountId,
            receiverId: _recipient,
            actions: [
              {
                type: 'Transfer',
                params: { deposit: parseAmount(amount, decimals) },
              },
            ],
          };
    return transferTransaction;
  },
  async send(params: SendParams) {
    const transactions = await this.generateTransaction(params);
    const res = await rpcToWallet('signAndSendTransaction', transactions);
    const transformedRes = nearServices.handleTransactionResult(res);
    return transformedRes;
  },
  async calculateGasFee(params: SendParams) {
    const transactions = await this.generateTransaction(params);
    const res = await gasFeeService.calculateGasFee([transactions]);
    return res;
  },
};
