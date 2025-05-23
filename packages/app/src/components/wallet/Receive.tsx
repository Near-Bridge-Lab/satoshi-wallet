import { useRequest } from '@/hooks/useHooks';
import { useWalletStore } from '@/stores/wallet';
import { Image, Snippet } from '@nextui-org/react';
import QRCode from 'qrcode';
import Loading from '../basic/Loading';

export default function Receive() {
  const { accountId } = useWalletStore();

  const { data: qrcode, loading } = useRequest(
    async () => {
      if (!accountId) return '';
      const res = await QRCode.toDataURL(accountId, {
        errorCorrectionLevel: 'H',
        width: 400,
        margin: 2,
      });
      return res;
    },
    {
      refreshDeps: [accountId],
    },
  );

  return (
    <div>
      <div className="flex items-center justify-center">
        <Loading loading={loading}>
          {qrcode && <Image src={qrcode} width={260} height={260} />}
        </Loading>
      </div>
      <div className="flex items-center justify-center gap-2 p-5 ">
        <Snippet
          classNames={{ base: 'bg-transparent p-0', pre: 'whitespace-pre-wrap break-all' }}
          hideSymbol
        >
          {accountId}
        </Snippet>
      </div>
    </div>
  );
}
