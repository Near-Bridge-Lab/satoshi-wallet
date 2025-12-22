import request from '@/utils/request';
import { nearServices } from './near';
import { safeBig } from '@/utils/big';
import { formatAmount } from '@/utils/format';

const BASE_URL =
  process.env.NEXT_PUBLIC_NETWORK === 'testnet'
    ? 'https://test.api.fastnear.com'
    : 'https://api.fastnear.com';

const BLACKLIST_CONTRACTS = [
  'kusama-airdrop.near',
  'adtoken.near',
  'laboratory.jumpfinance.near',
  'reftoken.near',
  'nearrewards.near',
  'burrowfinancedao.near',
  'dragoneggsmeme.near',
  'lonkrewards.near',
  'ad.0xshitzu.near',
  'metapools.near',
  'richenear.tkn.near',
  'ad.doubleon.near',
  'nearrewards.near',
  'nearreward.near',
  'meteor-points.near',
  'aurora',
];

const BLACKLIST_NFT_CONTRACTS = [
  'event-drop.near',
  'claim-rewards.near',
  'near-rewards.near',
  'nft-rewards.near',
  'nearrewards.near',
  'blackdragonforevernft.near',
];

// Transaction types
export interface AccountTx {
  account_id: string;
  signer_id: string;
  transaction_hash: string;
  tx_block_height: number;
  tx_block_timestamp: number;
}

interface FunctionCallAction {
  FunctionCall: {
    args: string;
    deposit: string;
    gas: number;
    method_name: string;
  };
}

interface TransferAction {
  Transfer: {
    deposit: string;
  };
}

interface DelegateAction {
  Delegate: {
    public_key: string;
    receiver_id: string;
    actions: any[];
  };
}

type Action = FunctionCallAction | TransferAction | DelegateAction;

interface TransactionInfo {
  actions: Action[];
  hash: string;
  nonce: number;
  public_key: string;
  receiver_id: string;
  signer_id: string;
}

interface ExecutionOutcome {
  block_hash: string;
  block_timestamp: number;
  outcome: {
    executor_id: string;
    gas_burnt: number;
    status: {
      SuccessReceiptId?: string;
      SuccessValue?: string;
      Failure?: any;
    };
    logs?: string[];
  };
}

export interface Transaction {
  transaction: TransactionInfo;
  execution_outcome: ExecutionOutcome;
  receipts?: any[];
  data_receipts?: any[];
}

export interface TransactionResponse {
  account_txs: AccountTx[];
  transactions: Transaction[];
  txs_count: number;
}

export const fastNearServices = {
  async getAccountTokens(accountId: string) {
    if (!accountId) return;

    try {
      const res = await request<{ tokens: { contract_id: string; balance: string }[] }>(
        `${BASE_URL}/v1/account/${accountId}/ft`,
      );

      const tokens = await Promise.all(
        res.tokens
          .filter(
            (token) =>
              !BLACKLIST_CONTRACTS.includes(token.contract_id) && safeBig(token.balance).gt(0),
          )
          .map(async (token) => {
            const metadata = await nearServices.queryTokenMetadata(token.contract_id);
            return {
              contract_id: token.contract_id,
              metadata,
              balance: formatAmount(token.balance, metadata?.decimals),
            };
          }),
      );

      return tokens;
    } catch (error) {
      console.error('Failed to fetch tokens from FastNear:', error);
    }
  },

  async getAccountNFTs(accountId: string) {
    if (!accountId) return;

    try {
      const res = await request<{ tokens: { contract_id: string }[] }>(
        `${BASE_URL}/v1/account/${accountId}/nft`,
      );

      const nfts = await Promise.all(
        res.tokens
          .filter((token) => !BLACKLIST_NFT_CONTRACTS.includes(token.contract_id))
          .map(async (token) => {
            const items = await nearServices.query<NFTMetadata[]>({
              contractId: token.contract_id,
              method: 'nft_tokens_for_owner',
              args: { account_id: accountId },
            });
            items?.forEach((item) => {
              item.contract_id = token.contract_id;
            });
            return items || [];
          }),
      );

      return nfts.flat();
    } catch (error) {
      console.error('Failed to fetch NFTs from FastNear:', error);
    }
  },

  async queryTransactions(accountId: string) {
    if (!accountId) return;

    try {
      const res = await request<TransactionResponse>(
        `https://explorer.main.fastnear.com/v0/account`,
        {
          method: 'POST',
          body: { account_id: accountId },
        },
      );

      return res;
    } catch (error) {
      console.error('Failed to fetch transactions from FastNear:', error);
    }
  },
};
