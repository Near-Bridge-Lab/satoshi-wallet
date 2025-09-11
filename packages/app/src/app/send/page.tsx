'use client';
import Loading from '@/components/basic/Loading';
import Navbar from '@/components/basic/Navbar';
import TokenIcon from '@/components/wallet/TokenIcon';
import { useTokenSelector } from '@/components/wallet/Tokens';
import { BTC_TOKEN_CONTRACT } from '@/config';
import { nearServices } from '@/services/near';
import { useTokenStore } from '@/stores/token';
import { useWalletStore } from '@/stores/wallet';
import { formatNumber, formatToken, formatValidNumber, parseAmount } from '@/utils/format';
import { Icon } from '@iconify/react';
import { Alert, Button, Divider, Image, Input, InputProps } from '@nextui-org/react';
import Big from 'big.js';
import { get } from 'lodash-es';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import GasFee from '@/components/wallet/GasFee';
import { sendServices } from '@/services/send';
import { safeBig } from '@/utils/big';

interface SendForm {
  token: string;
  recipient: string;
  amount: string;
}

export default function Send() {
  const query = useSearchParams();
  const { displayTokens, tokenMeta, balances, refreshBalance } = useTokenStore();
  const { isNearWallet } = useWalletStore();

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
      token: query.get('token') || (isNearWallet ? 'near' : BTC_TOKEN_CONTRACT),
      recipient: '',
      amount: '',
    },
    mode: 'onTouched',
  });

  const amount = watch('amount');
  const token = watch('token');
  const recipient = watch('recipient');

  useEffect(() => {
    if (!token && displayTokens?.length) setValue('token', displayTokens[0]);
  }, [displayTokens]);

  const balance = useMemo(() => balances?.[token], [balances, token]);
  const availableBalance = useMemo(
    () => nearServices.getAvailableBalance(token, balance),
    [balance, token],
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
    const res = await open({ value: token });
    res && setValue('token', res);
  }

  const [loading, setLoading] = useState(false);

  // Account validation states
  const [accountExists, setAccountExists] = useState<boolean | null>(null);
  const [isCheckingAccount, setIsCheckingAccount] = useState(false);

  // Account type detection
  const accountType = useMemo(() => {
    return sendServices.getAccountType(recipient);
  }, [recipient]);

  // Account validation result
  const accountValidation = useMemo(() => {
    if (!recipient) return { status: 'neutral', message: null, allowSend: false };

    // Block BTC addresses and invalid formats immediately
    if (accountType === 'btc') {
      return {
        status: 'blocked' as const,
        message: 'BTC addresses are not supported',
        allowSend: false,
      };
    }

    if (accountType === 'invalid') {
      return {
        status: 'blocked' as const,
        message: 'Invalid account format',
        allowSend: false,
      };
    }

    // For EVM addresses, check if they exist on NEAR
    if (accountType === 'evm') {
      if (accountExists === null) {
        return { status: 'checking' as const, message: 'Checking account...', allowSend: false };
      }
      if (accountExists) {
        return { status: 'good' as const, message: null, allowSend: true };
      }
      // EVM addresses cannot be created automatically on NEAR
      return {
        status: 'blocked' as const,
        message: 'EVM address not activated on NEAR Protocol',
        allowSend: false,
      };
    }

    // For NEAR implicit accounts
    if (accountType === 'implicit') {
      if (accountExists === null) {
        return { status: 'checking' as const, message: 'Checking account...', allowSend: false };
      }
      if (accountExists) {
        return { status: 'good' as const, message: null, allowSend: true };
      }
      // Implicit accounts can be created automatically
      return {
        status: 'warning' as const,
        message: 'Account will be created automatically on this deposit',
        allowSend: true,
      };
    }

    // For NEAR named accounts
    if (accountType === 'named') {
      if (accountExists === null) {
        return { status: 'checking' as const, message: 'Checking account...', allowSend: false };
      }
      if (accountExists) {
        return { status: 'good' as const, message: null, allowSend: true };
      }
      // Named accounts cannot be created automatically - block them
      return {
        status: 'blocked' as const,
        message: 'Named account does not exist and cannot be created automatically',
        allowSend: false,
      };
    }

    return { status: 'neutral' as const, message: null, allowSend: false };
  }, [recipient, accountType, accountExists]);

  // Check account exists for all address types except BTC
  const checkAccountExists = useCallback(
    async (accountId: string) => {
      if (!accountId) {
        setAccountExists(null);
        setIsCheckingAccount(false);
        return;
      }

      // Don't check BTC addresses or invalid formats
      if (accountType === 'btc' || accountType === 'invalid') {
        setAccountExists(null);
        setIsCheckingAccount(false);
        return;
      }

      setIsCheckingAccount(true);
      try {
        const near = await nearServices.nearConnect();
        await near.connection.provider.query({
          request_type: 'view_account',
          finality: 'final',
          account_id: accountType === 'evm' ? accountId.toLowerCase() : accountId,
        });
        setAccountExists(true);
      } catch (error) {
        setAccountExists(false);
      } finally {
        setIsCheckingAccount(false);
      }
    },
    [accountType],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      checkAccountExists(recipient);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [recipient, checkAccountExists]);

  // Get input field color based on validation status
  const getInputVariant = useMemo(() => {
    switch (accountValidation.status) {
      case 'good':
        return 'flat';
      case 'warning':
        return 'flat';
      case 'blocked':
        return 'bordered';
      case 'checking':
        return 'flat';
      default:
        return 'flat';
    }
  }, [accountValidation.status]);

  const getInputClassNames = useMemo(() => {
    switch (accountValidation.status) {
      case 'good':
        return {
          inputWrapper:
            'border-2 border-success-300 bg-success-50 hover:border-success-400 focus-within:!border-success-500',
          input: 'text-success-700',
        };
      case 'warning':
        return {
          inputWrapper:
            'border-2 border-warning-300 bg-warning-50 hover:border-warning-400 focus-within:!border-warning-500',
          input: 'text-warning-700',
        };
      case 'blocked':
        return {
          inputWrapper:
            'border-2 border-danger-300 bg-danger-50 hover:border-danger-400 focus-within:!border-danger-500',
          input: 'text-danger-700',
        };
      default:
        return {};
    }
  }, [accountValidation.status]);

  async function handleSend(data: SendForm) {
    try {
      setLoading(true);
      const res = await sendServices.send(data);
      console.log(res);
      refreshBalance(data.token);
      toast.success('Send success');
    } catch (error: any) {
      console.error(error);
      if (
        error?.message &&
        !error?.message?.match(/User rejected the request|User cancelled the action/)
      )
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
                <TokenIcon address={token} width={24} height={24} />
                <span className="text-base">{formatToken(tokenMeta[token]?.symbol)}</span>
              </div>
              <Icon icon="eva:chevron-right-fill" className="text-lg " />
            </div>
          </div>
          <Controller
            name="recipient"
            control={control}
            rules={{
              required: 'Recipient address is required',
              validate: () =>
                accountValidation.allowSend || accountValidation.message || 'Invalid recipient',
            }}
            render={({ field }) => (
              <Input
                label="To"
                {...field}
                variant={getInputVariant}
                classNames={getInputClassNames}
                labelPlacement="outside"
                size="lg"
                placeholder="Enter NEAR account ID"
                maxLength={64}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^a-zA-Z0-9._-]/g, '');
                  field.onChange(value);
                }}
                endContent={
                  <div className="flex items-center gap-2">
                    <Icon
                      icon={
                        isCheckingAccount
                          ? 'eos-icons:loading'
                          : accountValidation.status === 'good'
                            ? 'tabler:check'
                            : 'hugeicons:contact-01'
                      }
                      className={`text-lg ${accountValidation.status === 'good' ? 'text-success-500' : ''}`}
                    />
                  </div>
                }
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
                  if (safeBig(value).gt(availableBalance)) {
                    return safeBig(availableBalance).eq(0)
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
                    <span className="font-bold">{formatToken(tokenMeta[token]?.symbol)}</span>
                  }
                  onChange={(e) => {
                    field.onChange(formatValidNumber(e.target.value, tokenMeta[token]?.decimals));
                  }}
                />
              )}
            ></Controller>
            <div className="text-default-500 text-right text-xs mt-3">
              Balance: {formatNumber(balance, { rm: Big.roundDown })}{' '}
              {formatToken(tokenMeta[token]?.symbol)}
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
          {!isNearWallet && (
            <div className="text-sm text-default-500 leading-8">
              <Divider className="my-3" />
              <GasFee type="send" token={token} recipient={recipient} amount={availableBalance} />
            </div>
          )}
        </div>

        {accountValidation.message && (
          <div>
            <Alert
              variant="faded"
              color={
                accountValidation.status === 'blocked'
                  ? 'danger'
                  : accountValidation.status === 'warning'
                    ? 'warning'
                    : 'default'
              }
              icon={
                <Icon
                  icon={
                    accountValidation.status === 'blocked'
                      ? 'eva:alert-triangle-outline'
                      : accountValidation.status === 'warning'
                        ? 'eva:info-outline'
                        : 'eva:checkmark-circle-outline'
                  }
                />
              }
              title={
                accountValidation.status === 'blocked'
                  ? 'Cannot send to this address'
                  : accountValidation.status === 'warning'
                    ? 'Account does not exist yet'
                    : 'Account validation'
              }
              description={<div className="text-xs">{accountValidation.message}</div>}
            />
          </div>
        )}

        <div>
          <Button
            color="primary"
            size="lg"
            className="font-bold"
            fullWidth
            isLoading={loading}
            isDisabled={
              !recipient ||
              safeBig(amount).lte(0) ||
              !accountValidation.allowSend ||
              isCheckingAccount
            }
            onClick={handleSubmit(handleSend)}
          >
            Send
          </Button>
        </div>
      </div>
    </Suspense>
  );
}
