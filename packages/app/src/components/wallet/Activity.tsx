import { useCallback, useState } from 'react';
import { useInfiniteScroll, useRequest } from '@/hooks/useHooks';
import Empty from '../basic/Empty';
import { BridgeTransaction, RawTransaction, transactionServices } from '@/services/tranction';
import Loading from '../basic/Loading';
import dayjs from '@/utils/dayjs';
import { formatAmount, formatExplorerUrl, formatFileUrl, formatSortAddress } from '@/utils/format';
import { Chip, ChipProps, Image, Link, Tab, Tabs } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import Big from 'big.js';
import Tooltip from '../basic/Tooltip';
import NearActivity from './NearActivity';
import { useWalletStore } from '@/stores/wallet';

const StatusMap = {
  success: {
    label: 'Success',
    color: 'success',
  },
  failed: {
    label: 'Failed',
    color: 'danger',
  },
  pending: {
    label: 'Pending',
    color: 'warning',
  },
};

export default function Activity() {
  const { isNearWallet } = useWalletStore();
  const [tab, setTab] = useState<'all' | 'near' | 'transaction' | 'bridge'>('all');

  return (
    <div className="w-full relative">
      {isNearWallet ? (
        <NearActivity />
      ) : (
        <Tabs
          color="primary"
          selectedKey={tab}
          onSelectionChange={(key) => setTab(key as 'all' | 'transaction' | 'bridge')}
        >
          <Tab key="all" title="All">
            <NearActivity />
          </Tab>
          <Tab key="transaction" title="Transaction">
            <TransactionHistory />
          </Tab>
          <Tab key="bridge" title="Bridge">
            <BridgeTransactionHistory />
          </Tab>
        </Tabs>
      )}
    </div>
  );
}

export function BridgeTransactionHistory({ address }: { address?: string }) {
  const [txs, setTxs] = useState<BridgeTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 10;
  const { loading } = useRequest(() => transactionServices.bridgeTxsHistory({ page, pageSize }), {
    refreshDeps: [page],
    onSuccess(res) {
      setTxs((prev) => (page === 1 ? res : [...prev, ...res]));
      setHasMore(res.length === pageSize);
    },
  });

  function loadMore() {
    if (loading) return;
    setPage(page + 1);
  }

  useInfiniteScroll({
    hasMore,
    onLoadMore: loadMore,
    distance: 50,
  });

  /**
   * BridgeStatusSend            = 0
BridgeStatusSigned          = 1
BridgeStatusInBlock         = 2
BridgeStatusConfirmed       = 3
BridgeStatusVerified        = 4
BridgeStatusNearCASigned    = 5 // CA = ChainAbstraction
BridgeStatusWithdrawSent    = 6
BridgeStatusVerifySent      = 7
BridgeStatusWithdrawLessFee = 102
   */
  const Status = useCallback(
    ({ data, className }: { data: BridgeTransaction; className?: string }) => {
      const props = {
        variant: 'flat',
        size: 'sm',
        classNames: { base: 'h-5', content: 'text-xs' },
      } as ChipProps;

      const status = data.Status === 4 ? 'success' : data.Status >= 50 ? 'failed' : 'pending';

      return (
        <Chip
          color={StatusMap[status].color as ChipProps['color']}
          {...props}
          className={className}
        >
          {StatusMap[status].label}
        </Chip>
      );
    },
    [],
  );

  return (
    <div className="w-full">
      {txs?.length ? (
        txs.map((tx, index) => (
          <div key={index} className="card block mb-3 w-full space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Image
                  src={formatFileUrl(`/assets/chain/${tx.FromChainId === 1 ? 'btc' : 'near'}.svg`)}
                  width={18}
                  height={18}
                />
                <Icon icon="ant-design:swap-right-outlined" className="text-default-500 text-xs" />
                <Image
                  src={formatFileUrl(`/assets/chain/${tx.ToChainId === 1 ? 'btc' : 'near'}.svg`)}
                  width={18}
                  height={18}
                />
              </div>
              <Status data={tx} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-default-500 text-xs">
                Send: <span className="text-default-800">{formatSortAddress(tx.FromAccount)}</span>
              </div>
              <div className="text-default-500 text-xs">
                Receive: <span className="text-default-800">{formatSortAddress(tx.ToAccount)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-default-500 text-xs">
                Tx:{' '}
                <Link
                  size="sm"
                  href={formatExplorerUrl(tx.FromChainId === 1 ? 'BTC' : 'NEAR', tx.FromTxHash)}
                  className="text-default-500 text-xs"
                  isExternal
                  showAnchorIcon
                >
                  {formatSortAddress(tx.FromTxHash)}
                </Link>
              </div>
              <div className="text-default-500 text-xs">
                Tx:{' '}
                <Link
                  size="sm"
                  href={formatExplorerUrl(tx.ToChainId === 1 ? 'BTC' : 'NEAR', tx.ToTxHash)}
                  className="text-default-500 text-xs"
                  isExternal
                  showAnchorIcon
                >
                  {formatSortAddress(tx.ToTxHash)}
                </Link>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-default-500 text-xs">
              <div className="flex items-center gap-1">
                Amount:
                <span className="text-default-900 text-sm">{formatAmount(tx.Amount, 8)}</span>
                BTC
              </div>
              <div className="flex items-center gap-1">
                Fee:
                <Tooltip
                  content={
                    <div className="text-xs text-default-500">
                      <div>
                        Gas Fee:{' '}
                        <span className="text-default-900">{formatAmount(tx.GasFee, 8)}</span> BTC
                      </div>
                      <div>
                        Bridge Fee:{' '}
                        <span className="text-default-900">{formatAmount(tx.BridgeFee, 8)}</span>{' '}
                        BTC
                      </div>
                    </div>
                  }
                >
                  <span className="text-default-900 border-dashed border-b border-default-500">
                    {formatAmount(new Big(tx.GasFee).plus(tx.GasFee).toString(), 8)}
                  </span>
                </Tooltip>
                BTC
              </div>
            </div>
            <div className="text-default-400 text-xs text-right">
              {dayjs(tx.UpdateTime * 1000).format('YYYY/MM/DD HH:mm')}
            </div>
          </div>
        ))
      ) : (
        <Empty />
      )}
      <div className="flex justify-center py-4">
        <Loading loading={loading} />
      </div>
    </div>
  );
}

export function TransactionHistory({ address }: { address?: string }) {
  const [txs, setTxs] = useState<RawTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 10;

  const { loading } = useRequest(() => transactionServices.btcTxsHistory({ page, pageSize }), {
    refreshDeps: [page],
    onSuccess(res) {
      setTxs((prev) => (page === 1 ? res : [...prev, ...res]));
      setHasMore(res.length === pageSize);
    },
  });

  function loadMore() {
    if (loading) return;
    setPage(page + 1);
  }

  useInfiniteScroll({
    hasMore,
    onLoadMore: loadMore,
    distance: 50,
  });

  const Status = useCallback((data: RawTransaction) => {
    const props = {
      variant: 'flat',
      size: 'sm',
      classNames: { base: 'h-5', content: 'text-xs' },
    } as ChipProps;

    const status = data.Status === 3 ? 'success' : data.Status >= 100 ? 'failed' : 'pending';

    return (
      <Chip color={StatusMap[status].color as ChipProps['color']} {...props}>
        {StatusMap[status].label}
      </Chip>
    );
  }, []);

  return (
    <div className="w-full">
      {txs?.length ? (
        txs.map((tx, index) => (
          <div key={index} className="card mb-3">
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-base">Contract Call</span>
                </div>
                {Status(tx)}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {tx.NearHashList.map((hash, index) => (
                  <Link
                    key={index}
                    className="text-default-500 text-xs"
                    href={formatExplorerUrl('NEAR', hash)}
                    showAnchorIcon
                    isExternal
                    size="sm"
                  >
                    {formatSortAddress(hash)}
                  </Link>
                ))}
              </div>
              <div className="text-default-400 text-xs text-right">
                {dayjs(tx.UpdateTime * 1000).format('YYYY/MM/DD HH:mm')}
              </div>
            </div>
          </div>
        ))
      ) : (
        <Empty />
      )}
      <div className="flex justify-center py-4">
        <Loading loading={loading} />
      </div>
    </div>
  );
}
