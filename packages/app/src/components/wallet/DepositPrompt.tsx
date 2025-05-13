'use client';
import { RUNTIME_NETWORK } from '@/config';
import { useRequest } from '@/hooks/useHooks';
import { nearServices } from '@/services/near';
import { transactionServices } from '@/services/tranction';
import { useWalletStore } from '@/stores/wallet';
import { rpcToWallet } from '@/utils/request';
import { Icon } from '@iconify/react/dist/iconify.js';
import { Alert, Button } from '@nextui-org/react';
import { getDepositAmount, getWalletConfig } from 'btc-wallet';
import { useState } from 'react';
import { toast } from 'react-toastify';

export default function DepositPrompt() {
  const { accountId } = useWalletStore();

  const [isNewAccount, setIsNewAccount] = useState(false);

  const { data: isPending } = useRequest(
    async () => {
      if (!accountId) return false;
      const txs = await transactionServices.bridgeTxsHistory({ page: 1, pageSize: 1 });
      if (txs?.length > 0) {
        const lastTx = txs[0];
        // status 4 completed
        if (lastTx.Status !== 4) {
          return true;
        }
      }
    },
    {
      refreshDeps: [accountId, isNewAccount],
      before: () => isNewAccount,
      pollingInterval: 10000,
    },
  );

  useRequest(
    async () => {
      if (!accountId) return;
      const config = await getWalletConfig(RUNTIME_NETWORK);
      const res = await nearServices.query({
        contractId: config.accountContractId,
        method: 'get_account',
        args: { account_id: accountId },
      });
      return !res?.nonce;
    },
    {
      refreshDeps: [accountId, isPending],
      onSuccess(res) {
        setIsNewAccount(res ?? false);
      },
    },
  );

  const [activateLoading, setActivateLoading] = useState(false);
  async function handleActivate() {
    try {
      setActivateLoading(true);
      const { minDepositAmount } = await getDepositAmount('10000', {
        csna: accountId,
        env: RUNTIME_NETWORK,
        newAccountMinDepositAmount: true,
      });
      await rpcToWallet('executeBTCDepositAndAction' as any, {
        amount: minDepositAmount,
        pollResult: false,
        env: RUNTIME_NETWORK,
      });
      toast.success('Activation initiated, please wait for confirmation');
    } catch (error: any) {
      console.error(error);
      if (error?.message && !error?.message?.includes(`User rejected the request`))
        toast.error(`Activation failed: ${error.message}`);
    } finally {
      setActivateLoading(false);
    }
  }

  return (
    isNewAccount && (
      <div className="mb-4">
        <Alert
          variant="faded"
          color="warning"
          icon={<Icon icon="mdi:account" />}
          description={
            <div className="flex flex-col gap-1">
              <span>
                {isPending
                  ? `Activation is in progress, please wait for confirmation.`
                  : `Activate your account to start managing your BTC assets.`}
              </span>
            </div>
          }
          classNames={{ base: 'items-center' }}
          endContent={
            !isPending && (
              <Button
                color="primary"
                size="sm"
                isLoading={activateLoading}
                onClick={handleActivate}
              >
                Activate
              </Button>
            )
          }
        ></Alert>
      </div>
    )
  );
}
