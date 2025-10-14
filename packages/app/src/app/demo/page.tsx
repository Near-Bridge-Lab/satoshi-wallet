'use client';
import { useDebouncedEffect, useRequest } from '@/hooks/useHooks';
import { nearServices } from '@/services/near';
import {
  AccountState,
  setupWalletSelector,
  Wallet,
  WalletSelector,
} from '@near-wallet-selector/core';
import { SignMessageMethod } from '@near-wallet-selector/core/src/lib/wallet';
import { Suspense, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Button, Card, CardBody, CardHeader, Input, Snippet } from '@nextui-org/react';
import {
  setupBTCWallet,
  executeBTCDepositAndAction,
  getDepositAmount,
  getBtcBalance,
  BtcWalletSelectorContextProvider,
  getWithdrawTransaction,
  useBtcWalletSelector,
  type WalletSelectorModal,
  setupWalletSelectorModal,
  signMessage,
} from 'btc-wallet';

import Loading from '@/components/basic/Loading';
import { Icon } from '@iconify/react/dist/iconify.js';
import { formatAmount, formatFileUrl, formatNumber, parseAmount } from '@/utils/format';
import { BTC_TOKEN_CONTRACT, NEAR_RPC_NODES, RUNTIME_NETWORK } from '@/config';
import { btcBridgeServices } from '@/services/bridge';
import { useTokenStore } from '@/stores/token';
import { Image } from '@nextui-org/react';
import { TokenSelectorButton } from '@/components/wallet/Tokens';
import { nearSwapServices } from '@/services/swap';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import '@near-wallet-selector/modal-ui/styles.css';

type NearWallet = Wallet &
  SignMessageMethod & {
    selectWallet?: () => void;
    isSignedIn?: boolean;
    accountId?: string;
    disconnect?: () => void;
  };

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <BtcWalletSelectorContextProvider>
        <WalletPage />
      </BtcWalletSelectorContextProvider>
    </Suspense>
  );
}

function WalletPage() {
  const [walletSelectorModal, setWalletSelectorModal] = useState<WalletSelectorModal>();

  const [wallet, setWallet] = useState<NearWallet>();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [accountId, setAccountId] = useState<string>();
  const walletSelectorRef = useRef<WalletSelector>();
  const subscriptionRef = useRef<any>();

  const btcProvider = useBtcWalletSelector();

  useDebouncedEffect(() => {
    initWallet();

    return () => {
      subscriptionRef.current?.unsubscribe();
    };
  }, []);

  async function handleSignIn(accounts: AccountState[]) {
    try {
      const account = accounts.find((account) => account.active);

      const isSignedIn = !!account;
      setIsSignedIn(isSignedIn);
      setAccountId(process.env.NEXT_PUBLIC_TEST_NEAR_ACCOUNT || account?.accountId);
      const wallet = (await walletSelectorRef.current?.wallet()) as NearWallet;
      setWallet(wallet);
    } catch (error) {
      console.error('handleSignIn error', error);
    }
  }

  async function initWallet() {
    const network = nearServices.getNearConnectionConfig();

    const selector = await setupWalletSelector({
      network,
      fallbackRpcUrls: Object.values(NEAR_RPC_NODES),
      debug: true,
      modules: [
        setupBTCWallet({
          env: RUNTIME_NETWORK,
          walletUrl: location.origin,
        }),
        setupMeteorWallet() as any,
      ],
    });
    walletSelectorRef.current = selector;

    const modal = setupWalletSelectorModal(selector as any, {
      contractId: '',
      theme: 'dark',
      walletUrl: location.origin,
      initialPosition: { right: '10px', bottom: '40px' },
      buttonSize: '40px',
      mobileButtonSize: '30px',
    });
    setWalletSelectorModal(modal);
    if (!walletSelectorRef.current) return;
    const store = walletSelectorRef.current.store;

    const accounts = store.getState().accounts;

    handleSignIn(accounts);
    subscriptionRef.current = store.observable.subscribe((state) => {
      handleSignIn(state.accounts);
    });
  }

  async function selectWallet() {
    walletSelectorModal?.show();
  }

  async function disconnect() {
    try {
      await wallet?.signOut();
      console.log('disconnect', wallet);
      setIsSignedIn(false);
      setAccountId(undefined);
      setWallet(undefined);
    } catch (error) {
      console.error('disconnect error', error);
    }
  }

  return (
    <div className="w-screen h-screen bg-black">
      <div className="s-container  flex flex-col gap-5">
        <Card>
          <CardHeader className="font-bold text-lg">Wallet Connect</CardHeader>
          <CardBody className="gap-3">
            {isSignedIn ? (
              <>
                <Snippet
                  symbol={
                    <span className="text-xs text-default-500 inline-block pl-3 w-16">NEAR</span>
                  }
                  size="sm"
                >
                  {accountId}
                </Snippet>
                {wallet?.id === 'btc-wallet' && (
                  <Snippet
                    symbol={
                      <span className="text-xs text-default-500 inline-block pl-3 w-16">BTC</span>
                    }
                    size="sm"
                  >
                    {btcProvider.account}
                  </Snippet>
                )}
                <Button onClick={disconnect} size="sm">
                  Disconnect
                </Button>
              </>
            ) : (
              <Button color="primary" onClick={selectWallet}>
                Connect Wallet
              </Button>
            )}
          </CardBody>
        </Card>

        {wallet?.id === 'btc-wallet' && (
          <>
            <BTCBalance nearAccount={accountId!} btcAccount={btcProvider.account} />

            <BTCDepositAndWithdraw
              nearAccount={accountId!}
              btcAccount={btcProvider.account}
              wallet={wallet!}
            />

            <BTCSwapNEAR btcAccount={btcProvider.account} nearAccount={accountId!} />
            <SignMessage />
          </>
        )}
      </div>
    </div>
  );
}

function BTCBalance({ nearAccount, btcAccount }: { nearAccount: string; btcAccount: string }) {
  const {
    data: btcBalance,
    run: runBtcBalance,
    loading: btcBalanceLoading,
  } = useRequest(() => getBtcBalance(btcAccount), {
    refreshDeps: [nearAccount, btcAccount],
  });
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="font-bold text-lg">Native BTC Balance Info</div>
        <Button
          onClick={runBtcBalance}
          isIconOnly
          size="sm"
          isDisabled={btcBalanceLoading}
          variant="light"
        >
          <Icon
            icon="mdi:refresh"
            className={`text-base ${btcBalanceLoading ? 'animate-spin' : ''}`}
          />
        </Button>
      </CardHeader>
      <CardBody>
        <div className="text-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-default-500">Balance:</span> {btcBalance?.balance || '0'}
            <span className="text-xs text-default-500">BTC</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-default-500">Available Balance:</span>{' '}
            {btcBalance?.availableBalance || '0'}
            <span className="text-xs text-default-500">BTC</span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function BTCDepositAndWithdraw({
  btcAccount,
  nearAccount,
  wallet,
}: {
  btcAccount: string;
  nearAccount: string;
  wallet: NearWallet;
}) {
  const [depositLoading, setDepositLoading] = useState(false);
  async function handleBurrowSupply() {
    if (!depositAmount) return;
    try {
      setDepositLoading(true);
      const res = await executeBTCDepositAndAction({
        amount: parseAmount(depositAmount, 8),
        // action: {
        //   receiver_id: 'contract.dev-burrow.testnet',
        //   amount: (0.0001 * 10 ** 8).toFixed(0),
        //   msg: '',
        // },
        env: RUNTIME_NETWORK,
      });
      toast.success('Deposit Success,message:' + JSON.stringify(res));
    } catch (error: any) {
      console.error('deposit error', error);
      toast.error('Deposit failed:' + error.message);
    } finally {
      setDepositLoading(false);
    }
  }

  const [depositAmount, setDepositAmount] = useState<string>('0.0001');

  const { data: depositAmountRes, loading: depositAmountLoading } = useRequest(
    () => getDepositAmount(parseAmount(depositAmount, 8), { env: RUNTIME_NETWORK }),
    {
      refreshDeps: [depositAmount, nearAccount],
      before: () => !!nearAccount,
      debounceOptions: 1000,
    },
  );

  const [withdrawLoading, setWithdrawLoading] = useState(false);
  async function handleWithdraw() {
    if (!depositAmount) return;
    try {
      setWithdrawLoading(true);
      const res = await getWithdrawTransaction({
        amount: parseAmount(depositAmount, 8),
        env: RUNTIME_NETWORK,
      });
      console.log(res);
      const tx = await wallet?.signAndSendTransaction(res);
      console.log(tx);
      toast.success('Withdraw Success');
    } catch (error) {
      console.error('withdraw error', error);
      toast.error('Withdraw failed');
    } finally {
      setWithdrawLoading(false);
    }
  }
  return (
    <Card>
      <CardHeader className="font-bold text-lg">BTC Deposit and Withdraw</CardHeader>
      <CardBody className="gap-5">
        <div className="flex items-center gap-3">
          <Input
            type="number"
            placeholder="Deposit BTC Amount"
            validationBehavior="aria"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            endContent={<span className="text-xs text-default-500">BTC</span>}
          />{' '}
        </div>
        <Loading loading={depositAmountLoading}>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-default-500">Receive Amount:</span>{' '}
              <span>
                {formatAmount(depositAmountRes?.receiveAmount, 8) || '0'}{' '}
                <span className="text-xs text-default-500">BTC</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-default-500">Protocol Fee:</span>{' '}
              <span>
                {formatAmount(depositAmountRes?.protocolFee, 8) || '0'}{' '}
                <span className="text-xs text-default-500">BTC</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-default-500">Repay Amount:</span>{' '}
              <span>
                {formatAmount(depositAmountRes?.repayAmount, 8) || '0'}{' '}
                <span className="text-xs text-default-500">BTC</span>
              </span>
            </div>
            {depositAmountRes?.newAccountMinDepositAmount ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-default-500">New Account Min Deposit Amount:</span>{' '}
                <span>
                  {formatAmount(depositAmountRes?.newAccountMinDepositAmount, 8) || '0'}{' '}
                  <span className="text-xs text-default-500">BTC</span>
                </span>
              </div>
            ) : null}
          </div>
        </Loading>
        <div className="flex items-center gap-5">
          <Button
            isLoading={depositLoading}
            color="primary"
            className="flex-shrink-0 flex-1"
            onClick={handleBurrowSupply}
          >
            Deposit {depositAmount} BTC
          </Button>
          <Button
            isLoading={withdrawLoading}
            onClick={handleWithdraw}
            className="flex-shrink-0 flex-1"
          >
            Withdraw {depositAmount} BTC
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function BTCSwapNEAR({ btcAccount, nearAccount }: { btcAccount: string; nearAccount: string }) {
  const { tokenMeta } = useTokenStore();
  const [amountIn, setAmountIn] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenIn, setTokenIn] = useState(BTC_TOKEN_CONTRACT);
  const [tokenOut, setTokenOut] = useState('near');

  const {
    data: estimate,
    loading: queryLoading,
    run: handleRefresh,
  } = useRequest(
    async () => {
      const btcBridgeRes = await btcBridgeServices.estimate({
        chain: 'btc',
        amount: amountIn,
        btcAccount,
        nearAccount,
      });
      const swapAmount = btcBridgeRes.receiveAmount;
      console.log('btcBridgeRes', btcBridgeRes);
      const swapRes = await nearSwapServices.query({
        tokenIn,
        tokenOut,
        amountIn: swapAmount,
      });
      const impactRes = await nearSwapServices.queryPriceImpact({
        tokenIn,
        tokenOut,
        amountIn: swapAmount,
      });
      const res = { ...swapRes, impact: impactRes, btcBridge: btcBridgeRes };
      console.log(res);
      return res;
    },
    {
      refreshDeps: [amountIn, tokenOut],
      before: () => !!amountIn,
      debounceOptions: { wait: 500 },
    },
  );

  async function handleSwap() {
    if (!amountIn) return;
    try {
      setLoading(true);
      const btcBridgeRes = await btcBridgeServices.estimate({
        chain: 'btc',
        amount: amountIn,
        btcAccount,
        nearAccount,
      });
      const swapAmount = btcBridgeRes.receiveAmount;
      const action = await nearSwapServices.generateAction({
        tokenIn,
        tokenOut,
        amountIn: swapAmount,
      });
      await executeBTCDepositAndAction({
        amount: parseAmount(amountIn, 8),
        action: {
          receiver_id: process.env.NEXT_PUBLIC_NEAR_SWAP_CONTRACT,
          amount: parseAmount(swapAmount, 8),
          msg: action.args.msg,
        },
        pollResult: false,
        env: RUNTIME_NETWORK,
      });
      toast.success('Swap in progress, please wait for confirmation, estimated time: 20 minutes');
    } catch (error: any) {
      console.error(error);
      toast.error('Swap failed:' + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h3 className="text-xl font-bold">BTC bridge and swap</h3>
        <Button
          isIconOnly
          variant="light"
          size="sm"
          isDisabled={queryLoading}
          onClick={handleRefresh}
        >
          <Icon
            icon="ic:sharp-refresh"
            className={`text-base ${queryLoading ? 'animate-spin' : ''}`}
          />
        </Button>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div>
          <Input
            type="number"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="eg: 0.001"
            validationBehavior="aria"
            endContent={
              <div className="flex items-center gap-2 pr-2">
                <Image
                  src={formatFileUrl('/assets/crypto/btc.svg')}
                  width={24}
                  height={24}
                  classNames={{ wrapper: 'flex-shrink-0' }}
                />
                BTC
              </div>
            }
          />
          <div className="flex justify-center py-2">
            <Icon icon="ic:baseline-swap-vert" className="text-base text-default-500" />
          </div>
          <div className="flex items-center justify-between gap-3 bg-default-100 pl-3 rounded-xl text-sm">
            <span> {formatNumber(estimate?.amountOut || 0)}</span>
            <TokenSelectorButton
              token={tokenOut}
              onSelect={(token) => setTokenOut(token)}
              className="bg-default-100"
            />
          </div>
        </div>

        {estimate && (
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-default-500">Price Impact</span>
              <span>-{formatNumber(estimate.impact)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-default-500">Minimum Receive</span>
              <span>
                {formatNumber(estimate.minAmountOut)} {tokenMeta[tokenOut]?.symbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-default-500">Slippage</span>
              <span>0.1%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-default-500">Gas Fee</span>
              <span>{formatNumber(estimate.btcBridge.gasFee)} BTC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-default-500">Protocol Fee</span>
              <span>{formatNumber(estimate.btcBridge.protocolFee)} BTC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-default-500">Estimated Time</span>
              <span>{estimate.btcBridge.time}</span>
            </div>
          </div>
        )}

        <Button
          color="primary"
          isLoading={loading || queryLoading}
          onClick={handleSwap}
          isDisabled={!amountIn}
        >
          {estimate?.btcBridge.error || 'Confirm swap'}
        </Button>
      </CardBody>
    </Card>
  );
}

function SignMessage() {
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [signatureBase58, setSignatureBase58] = useState('');
  const [publicKeyBase58, setPublicKeyBase58] = useState('');
  async function handleSignMessage() {
    const { signature, publicKey, signatureBase58, publicKeyBase58 } = await signMessage(message);
    setSignature(signature);
    setPublicKey(publicKey);
    setSignatureBase58(signatureBase58);
    setPublicKeyBase58(publicKeyBase58);
  }
  return (
    <Card>
      <CardHeader className="font-bold text-lg">Sign Message</CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message"
        />
        <Button color="primary" onClick={handleSignMessage} isDisabled={!message}>
          Sign Message
        </Button>
        <Snippet
          symbol={<span className="text-xs text-default-500">Signature: </span>}
          size="sm"
          className="text-xs"
        >
          {signature}
        </Snippet>
        <Snippet
          symbol={<span className="text-xs text-default-500">Public Key: </span>}
          size="sm"
          className="text-xs"
        >
          {publicKey}
        </Snippet>
        <Snippet
          symbol={<span className="text-xs text-default-500">Signature Base58: </span>}
          size="sm"
          className="text-xs"
        >
          {signatureBase58}
        </Snippet>
        <Snippet
          symbol={<span className="text-xs text-default-500">Public Key Base58: </span>}
          size="sm"
          className="text-xs"
        >
          {publicKeyBase58}
        </Snippet>
      </CardBody>
    </Card>
  );
}
