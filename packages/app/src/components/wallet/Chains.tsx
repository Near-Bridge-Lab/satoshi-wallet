'use client';
import { formatFileUrl } from '@/utils/format';
import { useWalletStore } from '@/stores/wallet';
import { Image } from '@nextui-org/react';

export default function ChainSelector() {
  const { isNearWallet } = useWalletStore();
  const chains = isNearWallet ? ['near'] : ['btc', 'near'];
  return (
    <div className="flex">
      {chains.map((chain, index) => (
        <Image
          key={chain}
          src={formatFileUrl(`/assets/chain/${chain}.svg`)}
          width={26}
          height={26}
          classNames={{ wrapper: `overflow-hidden rounded-full ${index > 0 ? '-ml-1' : ''}` }}
        />
      ))}
    </div>
  );
}
