'use client';
import Loading from '@/components/basic/Loading';
import ChainSelector from '@/components/wallet/Chains';
import DepositPrompt from '@/components/wallet/DepositPrompt';
import Tools from '@/components/wallet/Tools';
import { useClient } from '@/hooks/useHooks';
import { useTokenStore } from '@/stores/token';
import { useWalletStore } from '@/stores/wallet';
import { safeBig } from '@/utils/big';

import {
  formatFileUrl,
  formatNumber,
  formatPrice,
  formatSortAddress,
  formatToken,
} from '@/utils/format';
import { Icon } from '@iconify/react';
import {
  Button,
  Image,
  Snippet,
  Tabs,
  Tab,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Link,
} from '@nextui-org/react';
import Big from 'big.js';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

export default function Home() {
  const { isNearWallet } = useWalletStore();
  return (
    <main className="s-container flex flex-col min-h-screen">
      <div className="flex-1">
        {!isNearWallet && <DepositPrompt />}
        <Header className="mb-10" />
        <Balance className="mb-10" />
        <Tools className="mb-10" />
        <Portfolio />
      </div>
      <footer className="text-center text-xs text-default-500 pt-6 mt-auto">
        Powered By{' '}
        <Link href="https://satos.network/" isExternal className="text-xs">
          SatoshiProtocol
        </Link>
      </footer>
    </main>
  );
}

function Header({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <header className={`flex justify-between w-full ${className ?? ''}`}>
      <ChainSelector />
      <Account />
      <Button
        isIconOnly
        variant="flat"
        size="sm"
        radius="full"
        className="min-w-7 w-7 h-7 bg-default-100"
        onClick={() => router.push('/settings')}
      >
        <Icon icon="fluent:settings-48-filled" className="text-lg" />
      </Button>
    </header>
  );
}

function Account() {
  const { accountId, originalAccountId, originalPublicKey } = useWalletStore();
  const { isClient } = useClient();
  return (
    isClient && (
      <div className="flex flex-col gap-2 items-center">
        <div className="font-bold">Near Account</div>
        <Popover>
          <PopoverTrigger>
            <div className="flex items-center gap-2 text-sm text-default-500 bg-foreground/10 h-6 px-2 rounded-full cursor-pointer">
              <div className="">{formatSortAddress(accountId)}</div>
              <Icon icon="fluent:chevron-right-12-regular" />
            </div>
          </PopoverTrigger>
          <PopoverContent>
            <div className="p-1 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-5">
                <Image src={formatFileUrl('/assets/chain/near.svg')} width={24} height={24} />
                <Snippet
                  classNames={{ base: 'bg-transparent p-0' }}
                  codeString={accountId}
                  hideSymbol
                  tooltipProps={{ content: 'Copy Near Account' }}
                >
                  {formatSortAddress(accountId)}
                </Snippet>
              </div>
              {originalAccountId && (
                <div className="flex items-center justify-between gap-5">
                  <Image src={formatFileUrl('/assets/chain/btc.svg')} width={24} height={24} />
                  <Snippet
                    classNames={{ base: 'bg-transparent p-0' }}
                    codeString={originalAccountId}
                    hideSymbol
                    tooltipProps={{ content: 'Copy BTC Account' }}
                  >
                    {formatSortAddress(originalAccountId)}
                  </Snippet>
                </div>
              )}
              {originalPublicKey && (
                <div className="flex items-center justify-between gap-5">
                  <Icon icon="pepicons-pencil:key-circle-filled" className="text-2xl" />
                  <Snippet
                    classNames={{ base: 'bg-transparent p-0' }}
                    codeString={originalPublicKey}
                    hideSymbol
                    tooltipProps={{ content: 'Copy BTC Public Key' }}
                  >
                    {formatSortAddress(originalPublicKey)}
                  </Snippet>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  );
}

function Balance({ className }: { className?: string }) {
  const { isClient } = useClient();
  const { balances, prices, tokenMeta, displayTokens } = useTokenStore();
  const totalBalanceUSD = useMemo(() => {
    return Object.entries(balances ?? {}).reduce((acc, [token, balance]) => {
      if (!displayTokens?.includes(token)) {
        return acc;
      }
      return acc.plus(
        safeBig(balance)
          .times(safeBig(prices?.[token]?.price || 0))
          .toNumber(),
      );
    }, safeBig(0));
  }, [balances, prices, tokenMeta]);

  return (
    isClient && (
      <div className={`flex flex-col items-center justify-center gap-2 ${className ?? ''}`}>
        <div className="text-4xl font-bold">
          ${formatPrice(totalBalanceUSD.toFixed(2, Big.roundDown), { useUnit: false })}
        </div>
      </div>
    )
  );
}

const portfolios = [
  { label: 'Tokens', value: 'tokens' },
  { label: 'NFTs', value: 'nfts' },
  { label: 'Activity', value: 'activity' },
];

const Tokens = dynamic(() => import('@/components/wallet/Tokens').then((module) => module.Tokens), {
  loading: () => <Loading className="flex items-center justify-center min-h-[200px]" />,
  ssr: false,
});
const NFTs = dynamic(() => import('@/components/wallet/NFTs').then((module) => module.NFTs), {
  loading: () => <Loading className="flex items-center justify-center min-h-[200px]" />,
  ssr: false,
});
const Activity = dynamic(
  () => import('@/components/wallet/Activity').then((module) => module.default),
  {
    loading: () => <Loading className="flex items-center justify-center min-h-[200px]" />,
    ssr: false,
  },
);

function Portfolio({ className }: { className?: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState(portfolios[0].value);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <Tabs
          aria-label=""
          selectedKey={current}
          items={portfolios}
          classNames={{ tabList: 'gap-6', tab: 'text-xl font-bold px-0', cursor: 'hidden' }}
          variant="light"
          onSelectionChange={(v) => setCurrent(v.toString())}
        >
          {(item) => <Tab key={item.value} title={item.label}></Tab>}
        </Tabs>
        {current === 'tokens' && (
          <Button
            isIconOnly
            variant="flat"
            size="sm"
            radius="full"
            className="min-w-7 w-7 h-7 "
            onClick={() => router.push('/tokens')}
          >
            <Icon icon="fluent:add-12-filled" className="text-base text-primary" />
          </Button>
        )}
      </div>

      <div>
        {current === 'tokens' && <Tokens onClick={(v) => router.push(`/send?token=${v}`)} />}
        {current === 'nfts' && <NFTs />}
        {current === 'activity' && <Activity />}
      </div>
    </div>
  );
}
