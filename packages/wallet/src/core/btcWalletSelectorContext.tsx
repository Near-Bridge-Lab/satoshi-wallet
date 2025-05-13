import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ConnectProvider as BTCConnectProvider } from '../context';
import {
  UnisatConnector,
  XverseConnector,
  OKXConnector,
  BitgetConnector,
  MagicEdenConnector,
  BybitConnector,
  // BinanceConnector,
} from '../connector';
import { useBTCProvider, useConnectModal } from '../hooks';

import ComfirmBox from '../components/confirmBox';
import { retryOperation } from '../utils';

// Global handler to prevent duplicate events
const eventCache = {
  lastProcessedAccount: '',
  lastProcessedTime: 0,
};

const WalletSelectorContext = React.createContext<any>(null);

export function BtcWalletSelectorContextProvider({
  children,
}: {
  children: React.ReactNode;
  autoConnect?: boolean;
}) {
  const [isProcessing, setIsProcessing] = useState(false);

  const connectors = [
    new UnisatConnector(),
    new XverseConnector(),
    new OKXConnector(),
    new BitgetConnector(),
    // new BinanceConnector(),
    new MagicEdenConnector(),
    new BybitConnector(),
  ];

  const walletSelectorContextValue = useMemo(() => {
    const simpleFn: Record<string, ((e: any) => void)[]> = {};

    return {
      setIsProcessing,
      emit: (eventName: string, e: any) => {
        if (simpleFn[eventName] && simpleFn[eventName].length) {
          simpleFn[eventName].forEach((fn: (e: any) => void) => {
            fn(e);
          });
        }
      },
      on: (eventName: string, fn: (e: any) => void) => {
        simpleFn[eventName] = simpleFn[eventName] || [];
        simpleFn[eventName].push(fn);
      },
    };
  }, []);

  return (
    <WalletSelectorContext.Provider value={walletSelectorContextValue}>
      <BTCConnectProvider
        options={{
          projectId: 'btc',
          clientKey: 'btc',
          appId: 'btc',
          aaOptions: {
            accountContracts: {
              BTC: [
                {
                  chainIds: [686868],
                  version: '1.0.0',
                },
              ],
            },
          },
          walletOptions: {
            visible: true,
          },
        }}
        autoConnect={false}
        connectors={connectors}
      >
        {children}
        {isProcessing && (
          <ComfirmBox
            hash={''}
            status={0}
            onClose={() => {
              setIsProcessing(false);
            }}
          />
        )}
        <InitBtcWalletSelectorContext />
      </BTCConnectProvider>
    </WalletSelectorContext.Provider>
  );
}

function InitBtcWalletSelectorContext() {
  const context = useBtcWalletSelector();
  useEffect(() => {
    window.btcContext = context;
  }, [context]);
  return null;
}

export function useBtcWalletSelector() {
  // @ts-ignore
  const { openConnectModal, disconnect, requestDirectAccount, connectModalOpen } =
    useConnectModal();
  const {
    accounts,
    sendBitcoin,
    getPublicKey,
    provider,
    signMessage,
    connector,
    getNetwork,
    switchNetwork,
  } = useBTCProvider();
  const connectorRef = useRef<any>(null);
  const context = useContext(WalletSelectorContext);

  useEffect(() => {
    const handleAccountsChanged = (account: any) => {
      // Skip processing if we don't have an account
      if (!account?.length) return;

      // Create a key for this event
      const accountKey = JSON.stringify(account);
      const now = Date.now();

      // Force a minimum time between processing the same account (3 seconds)
      if (
        accountKey === eventCache.lastProcessedAccount &&
        now - eventCache.lastProcessedTime < 3000
      ) {
        return;
      }

      // Update cache
      eventCache.lastProcessedAccount = accountKey;
      eventCache.lastProcessedTime = now;

      getPublicKey().then((res) => {
        context.emit('updatePublicKey', res);
      });
    };

    connector?.on('accountsChanged', handleAccountsChanged);
    connectorRef.current = connector;

    return () => {
      connector?.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [connector, context, getPublicKey]);

  const hook = useMemo(() => {
    // Common connect method with two connection modes
    const connectWallet = async (useModal = false) => {
      if (connectModalOpen) return null;

      const account = accounts?.[0];
      if (account) return account;

      try {
        if (useModal) {
          openConnectModal?.();
        } else {
          await requestDirectAccount(connectorRef.current);
        }

        // Wait for account connection
        const account = await retryOperation(
          () => window.btcContext.account,
          (res) => !!res,
          {
            maxRetries: 100,
            delayMs: 1000,
          },
        );

        return account || null;
      } catch (error) {
        console.error('btcLoginError', error);
        context.emit('btcLoginError');
        return null;
      }
    };

    return {
      login: async () => {
        return connectWallet(true);
      },
      autoConnect: async () => {
        return connectWallet(false);
      },
      logout: () => {
        const accountId = accounts?.[0];
        if (!accountId) return;
        disconnect?.();
        context.emit('btcLogOut');
      },
      account: accounts?.[0],
      getPublicKey: async () => {
        const publicKey = await getPublicKey().catch(() => null);
        if (publicKey) return publicKey;

        await connectWallet(false);
        return getPublicKey();
      },
      signMessage: async (msg: string) => {
        await connectWallet(false);
        return signMessage(msg);
      },
      getContext: () => {
        return context;
      },
      getNetwork,
      switchNetwork,
      sendBitcoin: async (toAddress: string, satoshis: number, options?: { feeRate: number }) => {
        await connectWallet(false);
        return sendBitcoin(toAddress, satoshis, options);
      },
    };
  }, [
    accounts,
    getNetwork,
    switchNetwork,
    sendBitcoin,
    connectModalOpen,
    openConnectModal,
    context,
    requestDirectAccount,
    disconnect,
    getPublicKey,
    signMessage,
  ]);

  return hook;
}
