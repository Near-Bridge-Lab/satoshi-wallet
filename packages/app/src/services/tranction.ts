import { useWalletStore } from '@/stores/wallet';
import { generateUrl } from '@/utils/common';
import request from '@/utils/request';

export interface RawTransaction {
  Id: number;
  Status: number;
  GasLimit: string;
  GasToken: string;
  Csna: string;
  NearHashList: string[];
  NearRegisterHash: string;
  GasCostToken: string;
  GasCostNear: string;
  CreateTime: number;
  UpdateTime: number;
}

export interface BridgeTransaction {
  Id: number;
  Status: number;
  FromChainId: number;
  ToChainId: number;
  FromTxHash: string;
  ToTxHash: string;
  VerifyTxHash: string;
  GasFee: string;
  BridgeFee: string;
  ProtocolFee: string;
  RelayerFee: string;
  Amount: string;
  Relayer: string;
  BlockHeight: number;
  BlockHash: string;
  ToAccount: string;
  FromAccount: string;
  FromAccountPubKey: string;
  DepositAccount: string;
  PostActions: string;
  ExtraMsg: string;
  VOut: number;
  TxIndex: number;
  MerkleProof: string;
  Hex: string;
  PendingSignId: string;
  CreateTime: number;
  UpdateTime: number;
}

export const transactionServices = {
  async btcTxsHistory({ page = 1, pageSize = 10 }: { page?: number; pageSize?: number }) {
    const btcPubKey = useWalletStore.getState().originalPublicKey;
    const { result_data } = await request<{ result_data: RawTransaction[] }>(
      generateUrl(`${process.env.NEXT_PUBLIC_API_URL}/v1/btcTxsHistory`, {
        btcPubKey,
        page,
        pageSize,
      }),
    );
    return result_data;
  },
  async bridgeTxsHistory({ page = 1, pageSize = 10 }: { page?: number; pageSize?: number }) {
    const fromAddress = useWalletStore.getState().originalAccountId;
    const { result_data } = await request<{ result_data: BridgeTransaction[] }>(
      generateUrl(`${process.env.NEXT_PUBLIC_API_URL}/v1/history`, {
        // 0:ALL 1: BTC, 2: NEAR
        fromChainId: 0,
        fromAddress,
        page,
        pageSize,
      }),
    );
    return result_data;
  },
};
