import Receive from '@/components/wallet/Receive';
import { useMessageBoxContext } from '@/providers/MessageBoxProvider';
import { formatFileUrl } from '@/utils/format';
import { useRouter } from 'next/navigation';
import { Image } from '@nextui-org/react';
import { useWalletStore } from '@/stores/wallet';

type Action = 'send' | 'receive' | 'swap' | 'bridge';

export default function Tools({
  className,
  actions,
  address,
}: {
  className?: string;
  actions?: Action[];
  address?: string;
}) {
  const { isNearWallet } = useWalletStore();

  const tools = [
    { label: 'Send', icon: formatFileUrl('/wallet-assets/send.svg'), action: handleSend },
    { label: 'Receive', icon: formatFileUrl('/wallet-assets/receive.svg'), action: handleReceive },
    {
      label: 'Swap',
      icon: formatFileUrl('/wallet-assets/swap.svg'),
      action: handleSwap,
    },
    {
      label: 'Bridge',
      icon: formatFileUrl('/wallet-assets/bridge.svg'),
      action: handleBridge,
    },
  ].filter((item) => !actions || actions.includes(item.label.toLowerCase() as Action));

  const router = useRouter();

  const { openModal } = useMessageBoxContext();

  function handleSend() {
    router.push(address ? `/send?token=${address}` : '/send');
  }

  function handleReceive() {
    openModal({
      header: 'Receive',
      body: <Receive />,
      placement: 'bottom',
    });
  }

  function handleSwap() {
    router.push('/swap');
  }

  function handleBridge() {
    if (isNearWallet) {
      window.open('https://dex.rhea.finance/bridge', '_blank');
    } else {
      router.push('/bridge');
    }
  }

  return (
    <div
      className={`${tools.length === 4 ? 'grid grid-cols-4 gap-5' : 'flex items-center justify-center gap-20'}  ${className ?? ''}`}
    >
      {tools.map((item, index) => (
        <div
          key={index}
          className={`group flex flex-col items-center justify-center gap-2  ${'cursor-pointer'}`}
          onClick={item.action}
        >
          <div className="w-11 h-11 rounded-full bg-default-100  group-hover:bg-default-200 flex items-center justify-center">
            <Image src={item.icon} width={24} height={24} />
          </div>
          <div className="text-base font-bold">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
