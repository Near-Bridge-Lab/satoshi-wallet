'use client';
import { useWalletStore } from '@/stores/wallet';
import { useRequest } from '@/hooks/useHooks';
import { nearSwapServices } from '@/services/swap';
import { sendServices } from '@/services/send';
import { useTokenStore } from '@/stores/token';
import { useMemo } from 'react';
import { safeBig } from '@/utils/big';
import { BTC_TOKEN_CONTRACT } from '@/config';
import { formatNumber, formatPrice } from '@/utils/format';
import { Icon } from '@iconify/react';
import Tooltip from '../basic/Tooltip';
import TokenIcon from './TokenIcon';
import { cn } from '@nextui-org/react';

interface SwapGasFeeProps {
  type: 'swap';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}

interface SendGasFeeProps {
  type: 'send';
  token: string;
  recipient: string;
  amount: string;
}

type GasFeeProps = (SwapGasFeeProps | SendGasFeeProps) & {
  className?: string;
};

export default function GasFee(props: GasFeeProps) {
  const { isNearWallet } = useWalletStore();

  const { data: gasFeeData, loading: gasFeeLoading } = useRequest(
    async () => {
      if (props.type === 'swap') {
        const { tokenIn, tokenOut, amountIn } = props;
        return await nearSwapServices.calculateGasFee({
          tokenIn,
          tokenOut,
          amountIn,
        });
      } else {
        const { token, recipient, amount } = props;
        return await sendServices.calculateGasFee({
          token,
          recipient,
          amount,
        });
      }
    },
    {
      refreshDeps:
        props.type === 'swap' ? [props.tokenIn, props.tokenOut] : [props.token, props.recipient],
      before: () => !isNearWallet,
      debounceOptions: { wait: 1000 },
    },
  );

  if (isNearWallet) {
    return;
  }

  return (
    <div className={`flex items-center justify-between gap-2 ${props.className || ''}`}>
      <span>Fee</span>
      <FeeDisplay gasFeeData={gasFeeData} loading={gasFeeLoading} />
    </div>
  );
}

interface GasFeeResult {
  nearGasFee: string;
  btcGasFee: string;
  registerFee: string;
}

interface FeeDisplayProps {
  gasFeeData?: GasFeeResult | null;
  loading?: boolean;
  className?: string;
}

function FeeDisplay({ gasFeeData, loading = false, className = '' }: FeeDisplayProps) {
  const { prices } = useTokenStore();

  const totalUsdValue = useMemo(() => {
    if (!gasFeeData || loading) return '0';

    const nearPrice = Number(prices?.['near']?.price || 0);
    const btcPrice = Number(prices?.[BTC_TOKEN_CONTRACT]?.price || 0);

    let totalValue = safeBig(0);

    if (gasFeeData.nearGasFee && Number(gasFeeData.nearGasFee) > 0) {
      totalValue = totalValue.plus(safeBig(gasFeeData.nearGasFee).mul(nearPrice));
    }

    if (gasFeeData.btcGasFee && Number(gasFeeData.btcGasFee) > 0) {
      totalValue = totalValue.plus(safeBig(gasFeeData.btcGasFee).mul(btcPrice));
    }

    if (gasFeeData.registerFee && Number(gasFeeData.registerFee) > 0) {
      totalValue = totalValue.plus(safeBig(gasFeeData.registerFee).mul(nearPrice));
    }

    return totalValue.toFixed();
  }, [gasFeeData, prices, loading]);

  if (loading) {
    return <Icon icon="eos-icons:three-dots-loading" className="text-base" />;
  }

  return (
    <Tooltip
      isDisabled={safeBig(totalUsdValue).eq(0)}
      content={
        <div className="text-xs text-default-500 space-y-3 p-1">
          <div className="flex items-center justify-between gap-5">
            <div>Gas Fee:</div>
            <div>
              {safeBig(gasFeeData?.nearGasFee).gt(0) && (
                <div className="flex items-center gap-1">
                  <TokenIcon address={'near'} width={16} height={16} />{' '}
                  {formatNumber(gasFeeData?.nearGasFee)}
                </div>
              )}
              {safeBig(gasFeeData?.btcGasFee).gt(0) && (
                <div className="flex items-center gap-1">
                  <TokenIcon address={BTC_TOKEN_CONTRACT} width={16} height={16} />{' '}
                  {formatNumber(gasFeeData?.btcGasFee)}
                </div>
              )}
            </div>
          </div>
          {safeBig(gasFeeData?.registerFee).gt(0) && (
            <div className="flex items-center justify-between gap-5">
              <div>Register Fee:</div>
              <div className="flex items-center gap-1">
                <TokenIcon address={'near'} width={16} height={16} />{' '}
                {formatNumber(gasFeeData?.registerFee)}
              </div>
            </div>
          )}
        </div>
      }
    >
      <span
        className={cn(safeBig(totalUsdValue).gt(0) && 'underline hover:text-primary', className)}
      >
        {formatPrice(totalUsdValue, { showSign: true })}
      </span>
    </Tooltip>
  );
}
