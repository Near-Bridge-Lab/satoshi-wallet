'use client';
import Navbar from '@/components/basic/Navbar';
import { useClient, useRequest } from '@/hooks/useHooks';
import { nearServices } from '@/services/near';
import { useTokenStore } from '@/stores/token';
import { formatNumber, formatPrice, formatToken } from '@/utils/format';
import Big from 'big.js';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { Image } from '@nextui-org/react';
import Tools from '@/components/wallet/Tools';
import Empty from '@/components/basic/Empty';
import Activity from '@/components/wallet/Activity';

export const runtime = 'edge';

export default function TokenDetailPage() {
  const { isClient } = useClient();
  const { address } = useParams<{ address: string }>();
  const { tokenMeta, prices } = useTokenStore();
  const tm = useMemo(() => tokenMeta[address], [address, tokenMeta]);

  const { data: balance } = useRequest(() => nearServices.getBalance(address), {
    pollingInterval: 30000,
  });
  const balancesUSD = useMemo(
    () => (tm?.symbol ? new Big(prices?.[tm.symbol] || 0).times(balance || 0).toNumber() : 0),
    [balance, prices, tm],
  );

  return (
    isClient && (
      <div className="s-container">
        <Navbar className="mb-2"></Navbar>
        <div className="flex flex-col items-center justify-center mb-10">
          <Image
            src={tm?.icon}
            width={60}
            height={60}
            classNames={{ wrapper: 'rounded-full overflow-hidden w-15 h-15 mb-5' }}
          />
          <div className="text-lg font-bold">
            {formatNumber(balance, { rm: Big.roundDown })} {formatToken(tm?.symbol)}
          </div>
          <div className="text-default-500">${formatPrice(balancesUSD)}</div>
        </div>
        <Tools address={address} actions={['send', 'receive']} />
        <div className="mt-8">
          <div className="text-lg font-bold mb-5">Activity</div>
          <Activity />
        </div>
      </div>
    )
  );
}
