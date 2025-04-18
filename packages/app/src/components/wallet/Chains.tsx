'use client';
import { formatFileUrl } from '@/utils/format';
import { Image } from '@nextui-org/react';
import { useState } from 'react';

export default function ChainSelector() {
  const [chain, setChain] = useState<`${Chain}-${Chain}`>('btc-near');
  return (
    <div className="flex">
      <Image
        src={formatFileUrl(`/assets/chain/${chain.split('-')[0]}.svg`)}
        width={26}
        height={26}
        classNames={{ wrapper: 'overflow-hidden rounded-full' }}
      />
      <Image
        src={formatFileUrl(`/assets/chain/${chain.split('-')[1]}.svg`)}
        width={26}
        height={26}
        classNames={{ wrapper: 'overflow-hidden rounded-full -ml-1' }}
      />
    </div>
  );
}
