import { useWalletStore } from '@/stores/wallet';
import { fastNearServices, Transaction } from '@/services/fastnear';
import { Button, Spinner, Link, Code, Image } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import Empty from '../basic/Empty';
import dayjs from '@/utils/dayjs';
import { useRequest } from '@/hooks/useHooks';
import { formatExplorerUrl, formatSortAddress } from '@/utils/format';
import { useTokenStore } from '@/stores/token';
import { NEAR_TOKEN_CONTRACT } from '@/config';
import TokenIcon from './TokenIcon';

// Get transaction action type and details
const getTransactionAction = (tx: Transaction) => {
  const { tokenMeta } = useTokenStore.getState();
  const { accountId } = useWalletStore.getState();
  if (!tx.transaction.actions || tx.transaction.actions.length === 0) {
    return { type: 'Unknown', details: '' };
  }

  const action = tx.transaction.actions?.[0];

  if ('Transfer' in action) {
    const amount = BigInt(action.Transfer.deposit) / BigInt(10 ** 24);
    const isSender = tx.transaction.signer_id === tx.execution_outcome.outcome.executor_id;

    return {
      type: isSender ? 'Sent' : 'Received',
      details: `${isSender ? 'to' : 'from'} ${isSender ? tx.transaction.receiver_id : tx.transaction.signer_id}`,
      amount: amount.toString(),
      token: NEAR_TOKEN_CONTRACT,
      isReceived: !isSender,
    };
  } else if ('FunctionCall' in action && action.FunctionCall.method_name === 'ft_transfer') {
    const args = JSON.parse(atob(action.FunctionCall.args));
    const token = tx.transaction.receiver_id;
    const receiverId = args.receiver_id;
    const _tokenMeta = tokenMeta[token];
    const decimals = _tokenMeta?.decimals || 24;
    const amount = BigInt(args?.amount || 0) / BigInt(10 ** decimals);
    const isSender = tx.transaction.signer_id === accountId;

    return {
      type: isSender ? 'Sent' : 'Received',
      details: `${isSender ? 'to' : 'from'} ${isSender ? receiverId : tx.transaction.signer_id}`,
      amount: amount.toString(),
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

export default function NearActivity() {
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

  // Group transactions by date
  const groupedTransactions: Record<string, Transaction[]> = {};

  transactions.transactions.forEach((tx) => {
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
