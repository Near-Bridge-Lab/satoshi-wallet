'use client';
import Loading from '@/components/basic/Loading';
import Navbar from '@/components/basic/Navbar';
import { useTokenSelector } from '@/components/wallet/Tokens';
import { BTC_TOKEN_CONTRACT, NEAR_TOKEN_CONTRACT } from '@/config';
import { nearServices } from '@/services/near';
import { transactionServices } from '@/services/tranction';
import { useTokenStore } from '@/stores/token';
import { formatNumber, formatToken, formatValidNumber, parseAmount } from '@/utils/format';
import { rpcToWallet } from '@/utils/request';
import { Icon } from '@iconify/react';
import { Button, Image, Input, InputProps } from '@nextui-org/react';
import Big from 'big.js';
import { get } from 'lodash-es';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';

interface SendForm {
  token: string;
  recipient: string;
  amount: string;
}

export default function Send() {
  const query = useSearchParams();
  const { displayableTokens, tokenMeta, balances, refreshBalance } = useTokenStore();

  const {
    watch,
    control,
    getValues,
    setValue,
    handleSubmit,
    clearErrors,
    formState: { errors },
    reset: resetFormData,
    trigger,
  } = useForm<SendForm>({
    defaultValues: {
      token: query.get('token') || BTC_TOKEN_CONTRACT,
      recipient: '',
      amount: '',
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (!getValues('token') && displayableTokens?.length) setValue('token', displayableTokens[0]);
  }, [displayableTokens]);

  const balance = useMemo(() => balances?.[getValues('token')], [balances, getValues('token')]);
  const availableBalance = useMemo(
    () => nearServices.getAvailableBalance(getValues('token'), balance),
    [balance, getValues('token')],
  );

  const validator = useCallback(
    (key: keyof typeof errors) => {
      const error = get(errors, key);
      return error ? { isInvalid: true, errorMessage: error?.message?.toString() } : {};
    },
    [errors],
  );

  const inputCommonProps = useCallback(
    ({ key }: { key: keyof SendForm }) =>
      ({
        labelPlacement: 'outside',
        size: 'lg',
        // isClearable: true,,
        'aria-label': ' ',
        placeholder: ' ',
        validationBehavior: 'aria',
        variant: validator(key).isInvalid ? 'bordered' : 'flat',
      }) as InputProps,
    [validator],
  );

  const { open } = useTokenSelector();

  async function handleSelectToken() {
    const token = await open({ value: getValues('token') });
    token && setValue('token', token);
  }

  const [loading, setLoading] = useState(false);
  async function handleSend(data: SendForm) {
    try {
      setLoading(true);
      const registerTokenTrans = await nearServices.registerToken(data.token, data.recipient);
      const res = await rpcToWallet(
        'signAndSendTransaction',
        data.token !== NEAR_TOKEN_CONTRACT
          ? {
              receiverId: data.token,
              actions: [
                ...(registerTokenTrans?.actions || []),
                {
                  type: 'FunctionCall',
                  params: {
                    methodName: 'ft_transfer',
                    args: {
                      receiver_id: data.recipient,
                      amount: parseAmount(data.amount, tokenMeta[data.token]?.decimals),
                      msg: '',
                    },
                    deposit: '1',
                    gas: parseAmount(100, 12),
                  },
                },
              ],
            }
          : {
              receiverId: data.recipient,
              actions: [
                {
                  type: 'Transfer',
                  params: { deposit: parseAmount(data.amount, tokenMeta[data.token]?.decimals) },
                },
              ],
            },
      );
      console.log(res);
      refreshBalance(data.token);
      toast.success('Send success');
    } catch (error: any) {
      console.error(error);
      if (error?.message && !error?.message?.includes(`User rejected the request`))
        toast.error(`Send failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Suspense fallback={<Loading />}>
      <div className="s-container flex flex-col gap-5">
        <Navbar className="mb-5">
          <div className="text-lg font-bold text-center">Send</div>
        </Navbar>
        <div className="flex-1 flex flex-col gap-8">
          <div>
            <div className="card cursor-pointer" onClick={handleSelectToken}>
              <div className="flex items-center gap-3">
                <Image src={tokenMeta[getValues('token')]?.icon} width={24} height={24} />
                <span className="text-base">
                  {formatToken(tokenMeta[getValues('token')]?.symbol)}
                </span>
              </div>
              <Icon icon="eva:chevron-right-fill" className="text-lg " />
            </div>
          </div>
          <Controller
            name="recipient"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <Input
                label="To"
                {...field}
                {...validator('recipient')}
                {...inputCommonProps({ key: 'recipient' })}
                placeholder="Recipient's address"
                endContent={<Icon icon="hugeicons:contact-01" className="text-lg" />}
              />
            )}
          ></Controller>
          <div>
            <Controller
              name="amount"
              control={control}
              rules={{
                required: true,
                min: 0,
                validate: (value) => {
                  if (new Big(value).gt(availableBalance)) {
                    return new Big(availableBalance || 0).eq(0)
                      ? 'Insufficient balance'
                      : `Amount is greater than available balance: ${availableBalance}`;
                  }
                  return true;
                },
              }}
              render={({ field }) => (
                <Input
                  label="Amount"
                  placeholder="0"
                  type="number"
                  {...field}
                  {...validator('amount')}
                  {...inputCommonProps({ key: 'amount' })}
                  endContent={
                    <span className="font-bold">
                      {formatToken(tokenMeta[getValues('token')]?.symbol)}
                    </span>
                  }
                  onChange={(e) => {
                    field.onChange(
                      formatValidNumber(e.target.value, tokenMeta[getValues('token')]?.decimals),
                    );
                  }}
                />
              )}
            ></Controller>
            <div className="text-default-500 text-right text-xs mt-3">
              Balance: {formatNumber(balance)} {formatToken(tokenMeta[getValues('token')]?.symbol)}
              <Button
                size="sm"
                color="primary"
                className="py-0.5 px-2 min-w-min w-auto h-auto ml-2"
                onClick={() => {
                  setValue('amount', availableBalance);
                  trigger('amount');
                }}
              >
                MAX
              </Button>
            </div>
          </div>
        </div>
        <div>
          <Button
            color="primary"
            size="lg"
            className="font-bold"
            fullWidth
            isLoading={loading}
            isDisabled={!getValues('recipient') || new Big(getValues('amount') || 0).lte(0)}
            onClick={handleSubmit(handleSend)}
          >
            Send
          </Button>
        </div>
      </div>
    </Suspense>
  );
}
