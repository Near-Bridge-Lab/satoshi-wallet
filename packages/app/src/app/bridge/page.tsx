'use client';
import Loading from '@/components/basic/Loading';
import Navbar from '@/components/basic/Navbar';
import { useTokenSelector } from '@/components/wallet/Tokens';
import { BTC_TOKEN_CONTRACT, NEAR_TOKEN_CONTRACT, RUNTIME_NETWORK } from '@/config';
import { useClient, useDebouncedEffect, useRequest } from '@/hooks/useHooks';
import { useTokenStore } from '@/stores/token';
import { useWalletStore } from '@/stores/wallet';
import {
  formatAmount,
  formatFileUrl,
  formatNumber,
  formatPrice,
  formatSortAddress,
  formatValidNumber,
  parseAmount,
} from '@/utils/format';
import { Icon } from '@iconify/react';
import { Button, Image, Input, Snippet } from '@nextui-org/react';
import Big from 'big.js';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { get } from 'lodash-es';
import { toast } from 'react-toastify';
import { getBtcBalance, getWithdrawTransaction } from 'btc-wallet';
import { btcBridgeServices } from '@/services/bridge';
import { rpcToWallet } from '@/utils/request';
import { nearServices } from '@/services/near';

interface BridgeForm {
  fromChain: string;
  toChain: string;
  amountIn: string;
}

export default function Bridge() {
  const { isClient } = useClient();
  const { accountId, originalAccountId: btcAccountId } = useWalletStore();
  const query = useSearchParams();
  const { balances, refreshBalance, prices } = useTokenStore();

  const {
    watch,
    control,
    setError,
    clearErrors,
    getValues,
    setValue,
    handleSubmit,
    formState: { errors },
    trigger,
  } = useForm<BridgeForm>({
    defaultValues: {
      fromChain: 'btc',
      toChain: 'near',
      amountIn: '',
    },
    mode: 'onTouched',
  });

  const amountIn = watch('amountIn') || '0';
  const fromChain = watch('fromChain');
  const toChain = watch('toChain');

  const { data: btcBalanceRes } = useRequest(() => getBtcBalance(btcAccountId), {
    refreshDeps: [btcAccountId],
    pollingInterval: 20000,
  });

  const { data: estimated, loading: estimatedLoading } = useRequest(
    () => btcBridgeServices.estimate({ chain: fromChain, amount: amountIn }),
    {
      refreshDeps: [fromChain, amountIn],
      debounceOptions: { wait: 1000 },
    },
  );

  useDebouncedEffect(
    () => {
      estimatedLoading
        ? clearErrors('amountIn')
        : estimated?.error && setError('amountIn', { message: estimated.error });
    },
    [estimated?.error, estimatedLoading],
    { wait: 500 },
  );

  const chainBalance = useCallback(
    ({ chain }: { chain: string }) => {
      if (chain === 'btc') {
        return btcBalanceRes || {};
      }
      const balance = balances?.[BTC_TOKEN_CONTRACT] || 0;

      return { balance, availableBalance: balance };
    },
    [btcBalanceRes, balances],
  );

  const calculateUSD = useCallback(
    ({ amount }: { amount: string }) => {
      const btcPrice = prices?.[process.env.NEXT_PUBLIC_BTC_TOKEN_CONTRACT]?.price;
      return '$ ' + formatPrice(new Big(amount).times(btcPrice || 0).toString());
    },
    [prices],
  );

  const [isFocus, setIsFocus] = useState(false);

  const validator = useCallback(
    (key: keyof typeof errors) => {
      const error = get(errors, key);
      return error ? { isInvalid: true, errorMessage: error?.message?.toString() } : {};
    },
    [errors],
  );

  const isInsufficientBalance = useMemo(() => {
    if (!Number(amountIn)) return false;
    const { availableBalance } = chainBalance({ chain: fromChain }) || 0;
    if (!Number(availableBalance)) return true;
    try {
      return new Big(amountIn).gt(availableBalance || 0);
    } catch {
      return false;
    }
  }, [chainBalance, amountIn, fromChain]);

  const handleSwapDirection = useCallback(() => {
    const currentFromChain = getValues('fromChain');
    const currentToChain = getValues('toChain');

    setValue('fromChain', currentToChain);
    setValue('toChain', currentFromChain);
    setValue('amountIn', '');
  }, [setValue, getValues]);

  const [bridgeLoading, setBridgeLoading] = useState(false);

  const canBridge = useMemo(() => {
    return (
      !!Number(amountIn) &&
      !estimatedLoading &&
      !bridgeLoading &&
      Object.keys(errors).length === 0 &&
      estimated?.canBridge
    );
  }, [estimatedLoading, bridgeLoading, errors, amountIn]);

  function setMaxAmountIn() {
    const { availableBalance } = chainBalance({ chain: fromChain });
    setValue('amountIn', availableBalance?.toString() || '0');
    trigger('amountIn');
  }

  async function handleBridge(data: BridgeForm) {
    try {
      setBridgeLoading(true);
      const rawAmount = parseAmount(data.amountIn, 8);
      if (data.fromChain === 'btc') {
        await rpcToWallet('executeBTCDepositAndAction' as any, {
          amount: rawAmount,
          newAccountMinDepositAmount: false,
          pollResult: false,
          env: RUNTIME_NETWORK,
        });
        toast.success(
          'Bridge in progress, please wait for confirmation, estimated time: 20 minutes',
        );
      } else {
        const transaction = await getWithdrawTransaction({
          amount: rawAmount,
          env: RUNTIME_NETWORK,
          csna: accountId,
          btcAddress: btcAccountId,
        });
        await rpcToWallet('signAndSendTransaction', transaction);
        toast.success('Bridge success');
        refreshBalance(BTC_TOKEN_CONTRACT);
      }
    } catch (error: any) {
      console.error(error);
      if (error?.message && !error?.message?.includes(`User rejected the request`))
        toast.error(`Bridge failed: ${error.message}`);
    } finally {
      setBridgeLoading(false);
    }
  }

  const ChainAccount = useCallback(
    ({ chain }: { chain: string }) => {
      const account = chain === 'btc' ? btcAccountId : accountId;
      return (
        <Snippet
          codeString={account}
          hideSymbol
          size="sm"
          classNames={{ base: 'h-7 rounded-full', copyButton: 'scale-75' }}
        >
          {formatSortAddress(account)}
        </Snippet>
      );
    },
    [btcAccountId, accountId],
  );

  return (
    <Suspense fallback={<Loading />}>
      <div className="s-container">
        <Navbar className="mb-5">
          <div className="text-lg font-bold text-center">Bridge</div>
        </Navbar>

        {isClient && (
          <div className="flex flex-col gap-5">
            <div>
              {/* From Chain Input */}
              <div
                className={`bg-default-50 p-4 rounded-lg border hover:border-primary ${
                  isFocus ? 'border-primary' : 'border-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium text-default-500">From</span>
                    <ChainSelector chain={fromChain} />
                  </div>
                  <ChainAccount chain={fromChain} />
                </div>

                <div className="flex justify-between mb-2">
                  <Controller
                    name="amountIn"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Input
                        {...field}
                        classNames={{
                          base: 'flex-1',
                          input: 'text-2xl font-medium',
                          inputWrapper: '!bg-transparent !border-none px-0 shadow-none',
                        }}
                        size="lg"
                        variant="bordered"
                        placeholder="0"
                        {...validator('amountIn')}
                        validationBehavior="aria"
                        autoComplete="off"
                        onChange={(e) => {
                          field.onChange(formatValidNumber(e.target.value));
                        }}
                        onFocus={() => setIsFocus(true)}
                        onBlur={() => setIsFocus(false)}
                        endContent={<TokenSelector chain={fromChain} />}
                      />
                    )}
                  />
                </div>
                <div className="flex justify-between gap-2">
                  <div className="text-default-500 text-sm">
                    {calculateUSD({ amount: amountIn })}
                  </div>
                  <div className="text-default-500 text-sm">
                    Balance:{' '}
                    {formatNumber(chainBalance({ chain: fromChain })?.balance || 0, {
                      displayDecimals: 8,
                    })}
                    <Button
                      size="sm"
                      variant="light"
                      color="primary"
                      className="ml-2 p-0 min-w-0 h-auto"
                      onClick={setMaxAmountIn}
                    >
                      MAX
                    </Button>
                  </div>
                </div>
              </div>

              {/* Direction Button */}
              <div className="flex justify-center -my-3">
                <Button
                  isIconOnly
                  className="bg-default-50 border border-default-300 z-[1]"
                  size="sm"
                  radius="full"
                  onClick={handleSwapDirection}
                >
                  <Icon
                    icon="ic:baseline-swap-vert"
                    className="text-xl text-default-500 hover:text-default-800"
                  />
                </Button>
              </div>

              {/* To Chain Input */}
              <div className="bg-default-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-medium text-default-500">To</div>
                    <ChainSelector chain={toChain} />
                  </div>
                  <ChainAccount chain={toChain} />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-2xl font-medium">
                    {formatNumber(estimated?.receiveAmount || '0', { displayDecimals: 8 })}
                  </div>
                  <TokenSelector chain={toChain} />
                </div>
                <div className="flex justify-between gap-2">
                  <div className="text-default-500 text-sm">
                    {calculateUSD({ amount: estimated?.receiveAmount || '0' })}
                  </div>
                  <div className="text-default-500 text-sm">
                    Balance:{' '}
                    {formatNumber(chainBalance({ chain: toChain })?.balance || 0, {
                      displayDecimals: 8,
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Fee Info */}
            <div className="bg-default-50 p-4 rounded-lg text-sm text-default-500 leading-8">
              <div className="flex items-center justify-between">
                <span>Gas Fee</span>
                <span>{calculateUSD({ amount: estimated?.gasFee || '0' })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Protocol Fee</span>
                <span>{calculateUSD({ amount: estimated?.protocolFee || '0' })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated Time</span>
                <span>{estimated?.time}</span>
              </div>
            </div>

            {/* Bridge Button */}
            <Button
              color="primary"
              size="lg"
              className="font-bold"
              fullWidth
              isDisabled={!canBridge}
              onClick={handleSubmit(handleBridge)}
            >
              {estimatedLoading || bridgeLoading ? (
                <Icon icon="eos-icons:three-dots-loading" className="text-3xl" />
              ) : isInsufficientBalance ? (
                'Insufficient Balance'
              ) : (
                'Send'
              )}
            </Button>
          </div>
        )}
      </div>
    </Suspense>
  );
}

function ChainSelector({ chain, onSelect }: { chain: string; onSelect?: (chain: string) => void }) {
  const chainInfo = useMemo(
    () => btcBridgeServices.queryChains().find((item) => item.chain === chain),
    [chain],
  );
  return (
    <Button
      variant="light"
      size="sm"
      className="flex items-center gap-1 cursor-default !bg-transparent"
      onClick={() => onSelect?.(chain)}
      disableAnimation
    >
      <Image
        src={chainInfo?.icon}
        width={20}
        height={20}
        alt={chainInfo?.name}
        classNames={{ img: 'rounded-md border-1 border-default-300' }}
      />
      <div className="flex items-center text-sm">{chainInfo?.name}</div>
    </Button>
  );
}

function TokenSelector({
  chain,
  token,
  onSelect,
}: {
  chain: string;
  token?: string;
  onSelect?: (token?: string) => void;
}) {
  const { tokenMeta } = useTokenStore();
  return (
    <Button
      variant="flat"
      className="flex items-center gap-2 px-2.5 cursor-default flex-shrink-0"
      radius="full"
      onClick={() => onSelect?.(token)}
      disableAnimation
    >
      <Image
        src={
          chain === 'btc'
            ? formatFileUrl('/assets/crypto/btc.svg')
            : tokenMeta[BTC_TOKEN_CONTRACT]?.icon
        }
        width={20}
        height={20}
        alt={token}
        classNames={{ wrapper: 'rounded-full flex-shrink-0' }}
      />
      <div className="flex items-center">
        {chain === 'btc' ? 'BTC' : tokenMeta[BTC_TOKEN_CONTRACT]?.symbol}
      </div>
    </Button>
  );
}
