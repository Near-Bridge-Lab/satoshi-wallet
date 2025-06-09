import { useCallback, useState } from 'react';
import { useInfiniteScroll, useRequest } from '@/hooks/useHooks';
import Empty from '../basic/Empty';
import { BridgeTransaction, RawTransaction, transactionServices } from '@/services/transaction';
import Loading from '../basic/Loading';
import dayjs from '@/utils/dayjs';
import { formatAmount, formatExplorerUrl, formatFileUrl, formatSortAddress } from '@/utils/format';
import { Chip, ChipProps, Image, Link, Tab, Tabs, Spinner } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import Big from 'big.js';
import Tooltip from '../basic/Tooltip';
import { useWalletStore } from '@/stores/wallet';
import { useTokenStore } from '@/stores/token';
import { fastNearServices, Transaction } from '@/services/fastnear';
import { NEAR_TOKEN_CONTRACT } from '@/config';
import TokenIcon from './TokenIcon';

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
  const [tab, setTab] = useState<'transaction' | 'mpc' | 'bridge'>('transaction');

  return (
    <div className="w-full relative">
      {isNearWallet ? (
        <WalletTransactions />
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => setTab(key as 'transaction' | 'mpc' | 'bridge')}
          size="sm"
          variant="light"
          classNames={{ base: 'overflow-x-auto max-w-full', tabList: 'gap-1', tab: 'px-2' }}
        >
          <Tab
            key="transaction"
            title={
              <div className="flex items-center gap-1">
                <span>Wallet Transactions</span>
                <Tooltip content="User wallet transactions, including transactions after MPC signature">
                  <Icon icon="mingcute:question-line" className="text-xs" />
                </Tooltip>
              </div>
            }
          >
            <WalletTransactions />
          </Tab>
          <Tab
            key="mpc"
            title={
              <div className="flex items-center gap-1">
                <span>MPC Transactions</span>
                <Tooltip content="MPC request transactions and signed transactions">
                  <Icon icon="mingcute:question-line" className="text-xs" />
                </Tooltip>
              </div>
            }
          >
            <MPCTransactions />
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
              {dayjs(tx.CreateTime * 1000).format('YYYY/MM/DD HH:mm')}
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

export function MPCTransactions({ address }: { address?: string }) {
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
                {dayjs(tx.CreateTime * 1000).format('YYYY/MM/DD HH:mm')}
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

// Get transaction action type and details
const getTransactionAction = (tx: Transaction) => {
  const { tokenMeta } = useTokenStore.getState();
  const { accountId } = useWalletStore.getState();
  if (!tx.transaction.actions || tx.transaction.actions.length === 0) {
    return { type: 'Unknown', details: '' };
  }

  const action = tx.transaction.actions?.[0];
  const isSender = tx.transaction.signer_id === accountId;

  if ('Transfer' in action) {
    const amount = formatAmount(action.Transfer.deposit);

    return {
      type: isSender ? 'Sent' : 'Received',
      details: `${isSender ? 'to' : 'from'} ${formatSortAddress(
        isSender ? tx.transaction.receiver_id : tx.transaction.signer_id,
      )}`,
      amount,
      token: NEAR_TOKEN_CONTRACT,
      isReceived: !isSender,
    };
  } else if ('FunctionCall' in action && action.FunctionCall.method_name === 'ft_transfer') {
    const args = JSON.parse(atob(action.FunctionCall.args));
    const token = tx.transaction.receiver_id;
    const receiverId = args.receiver_id;
    const _tokenMeta = tokenMeta[token];
    const decimals = _tokenMeta?.decimals || 24;
    const amount = formatAmount(args?.amount || 0, decimals);

    return {
      type: isSender ? 'Sent' : 'Received',
      details: `${isSender ? 'to' : 'from'} ${formatSortAddress(
        isSender ? receiverId : tx.transaction.signer_id,
      )}`,
      amount,
      token,
      isReceived: !isSender,
    };
  } else if ('FunctionCall' in action) {
    const { method_name, args } = action.FunctionCall;

    return {
      type: 'App Interaction',
      details: (
        <>
          Called{' '}
          <span className="px-1 py-0.5 bg-default-300 text-default-600 rounded-md">
            {method_name}
          </span>{' '}
          on{' '}
          <span className="px-1 py-0.5 bg-default-300 text-default-600 rounded-md">
            {formatSortAddress(tx.transaction.receiver_id)}
          </span>
        </>
      ),
    };
  } else if ('Delegate' in action) {
    return {
      type: 'Delegation',
      details: `Delegated to ${action.Delegate.receiver_id}`,
    };
  } else if ('AddKey' in action) {
    const addKeyAction = action as {
      AddKey: { access_key?: { permission?: { FunctionCall?: { receiver_id: string } } } };
    };
    const receiverId = addKeyAction.AddKey.access_key?.permission?.FunctionCall?.receiver_id;

    return {
      type: 'Add Key',
      details: `Added access key${receiverId ? ' for ' + receiverId : ''}`,
    };
  } else if ('DeleteKey' in action) {
    return {
      type: 'Delete Key',
      details: 'Removed access key',
    };
  }

  return { type: 'Other', details: JSON.stringify(action) };
};

// Helper to determine the icon for a transaction
const getTransactionIcon = (actionType: string, details: any) => {
  switch (actionType) {
    case 'App Interaction':
      return <Icon icon="fluent:box-20-filled" className="text-default-500 text-2xl" />;
    case 'Token Transfer':
      return <Icon icon="ph:tokens-bold" className="text-primary-500 text-2xl" />;
    case 'Sent':
      return <Icon icon="ph:arrow-up-bold" className="text-danger-500 text-2xl" />;
    case 'Received':
      return <Icon icon="ph:arrow-down-bold" className="text-success-500 text-2xl" />;
    case 'Delegation':
      return <Icon icon="mdi:account-key" className="text-warning-500 text-2xl" />;
    case 'Add Key':
      return <Icon icon="mdi:key-plus" className="text-success-500 text-2xl" />;
    case 'Delete Key':
      return <Icon icon="mdi:key-remove" className="text-danger-500 text-2xl" />;
    default:
      return <Icon icon="ph:cube-bold" className="text-default-500 text-2xl" />;
  }
};

export function WalletTransactions() {
  const { accountId } = useWalletStore();
  const { tokenMeta } = useTokenStore.getState();

  const {
    data: transactions,
    loading,
    run: refetch,
  } = useRequest(() => fastNearServices.queryTransactions(accountId!), {
    refreshDeps: [accountId],
    before: () => !!accountId,
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!transactions || !transactions.transactions || transactions.transactions.length === 0) {
    return <Empty>No transactions found</Empty>;
  }

  const sortedTransactions = [...transactions.transactions].sort(
    (a, b) => b.execution_outcome.block_timestamp - a.execution_outcome.block_timestamp,
  );

  // Group transactions by date
  const groupedTransactions: Record<string, Transaction[]> = {};

  sortedTransactions.forEach((tx) => {
    let timestamp = tx.execution_outcome.block_timestamp / 1000000;
    const dateString = dayjs(timestamp).format('YYYY-MM-DD');

    if (!groupedTransactions[dateString]) {
      groupedTransactions[dateString] = [];
    }

    groupedTransactions[dateString].push(tx);
  });

  // Sort dates in descending order
  const sortedDates = Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {sortedDates.map((date) => (
        <div key={date} className="space-y-2">
          <div className="text-sm py-2">{dayjs(date).format('YYYY-MM-DD')}</div>

          {groupedTransactions[date].map((tx) => {
            const action = getTransactionAction(tx);

            return (
              <div key={tx.transaction.hash} className="card p-4">
                <div className="flex items-center gap-4 w-full">
                  <div className="flex-shrink-0">
                    {action.token ? (
                      <TokenIcon address={action.token} width={30} height={30} />
                    ) : (
                      getTransactionIcon(action.type, action.details)
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{action.type}</div>
                        <div className="text-xs text-default-500 leading-6 overflow-x-auto whitespace-nowrap">
                          {action.details}
                        </div>
                      </div>

                      {action.amount && (
                        <div
                          className={`text-right ${action.isReceived ? 'text-success-500' : 'text-danger-500'}`}
                        >
                          <div className="font-medium">
                            {action.isReceived ? '+' : '-'}
                            {action.amount}{' '}
                            {action.token ? tokenMeta[action.token]?.symbol : 'NEAR'}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <Link
                        size="sm"
                        href={formatExplorerUrl('NEAR', tx.transaction.hash, 'transaction')}
                        isExternal
                        showAnchorIcon
                        className="text-xs text-default-500"
                      >
                        {formatSortAddress(tx.transaction.hash)}
                      </Link>
                      <div className="text-xs text-default-400">
                        {dayjs(tx.execution_outcome.block_timestamp / 1000000).format(
                          'YYYY-MM-DD HH:mm',
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {accountId && (
        <div className="text-center">
          <Link
            href={formatExplorerUrl('NEAR', accountId, 'account')}
            isExternal
            showAnchorIcon
            size="sm"
          >
            More Transactions
          </Link>
        </div>
      )}
    </div>
  );
}
