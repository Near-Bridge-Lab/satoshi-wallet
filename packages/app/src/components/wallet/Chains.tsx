'use client';
import { formatFileUrl } from '@/utils/format';
import { useWalletStore } from '@/stores/wallet';
import { Image } from '@nextui-org/react';
import { useState } from 'react';

export default function ChainSelector() {
  const [chain, setChain] = useState<`${Chain}-${Chain}`>('btc-near');
  const { isNearWallet } = useWalletStore();
  return (
    <div className="flex">
      {!isNearWallet && (
        <Image
          src={formatFileUrl(`/assets/chain/${chain.split('-')[0]}.svg`)}
          width={26}
          height={26}
          classNames={{ wrapper: 'overflow-hidden rounded-full' }}
        />
      )}
      {isNearWallet && (
        <Image
          src={formatFileUrl(`/assets/chain/${chain.split('-')[1]}.svg`)}
          width={26}
          height={26}
          classNames={{ wrapper: 'overflow-hidden rounded-full -ml-1' }}
        />
      )}
    </div>
  );
}
