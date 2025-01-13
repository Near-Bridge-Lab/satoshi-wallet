import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ConnectProvider as BTCConnectProvider } from '../context';
import {
  UnisatConnector,
  XverseConnector,
  OKXConnector,
  BitgetConnector,
  MagicEdenConnector,
} from '../connector';
import { useBTCProvider, useConnectModal } from '../hooks';

import ComfirmBox from '../components/confirmBox';
import { retryOperation } from '../utils';

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
    // new XverseConnector(),
    new OKXConnector(),
    new BitgetConnector(),
    // new MagicEdenConnector(),
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
  const { openConnectModal, disconnect, requestDirectAccount } = useConnectModal();
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
  const publicKey = useRef<any>(null);
  const signMessageFn = useRef<any>(null);
  const connectorRef = useRef<any>(null);
  const context = useContext(WalletSelectorContext);
  const isLoggingIn = useRef(false);

  useEffect(() => {
    if (provider) {
      getPublicKey().then((res) => {
        publicKey.current = res;
      });
    }
  }, [getPublicKey, provider]);

  useEffect(() => {
    signMessageFn.current = signMessage;
  }, [signMessage]);

  useEffect(() => {
    const fn = (account: any) => {
      if (account) {
        getPublicKey().then((res) => {
          publicKey.current = res;
          context.emit('updatePublicKey', res);
        });
      }
    };

    if (connector) {
      connector.on('accountsChanged', fn);
    }
    connectorRef.current = connector;

    return () => {
      if (connector) {
        connector.removeListener('accountsChanged', fn);
      }
    };
  }, [connector, context, getPublicKey]);

  const hook = useMemo(() => {
    return {
      login: async () => {
        const account = accounts?.[0];
        if (!account) {
          if (isLoggingIn.current) {
            return null;
          }

          try {
            isLoggingIn.current = true;
            openConnectModal?.();

            const account1 = await retryOperation(
              () => window.btcContext.account,
              (res) => !!res,
              {
                maxRetries: 100,
                delayMs: 1000,
              },
            );

            if (!account1) {
              throw new Error('Failed to get account');
            }
            return account1;
          } finally {
            isLoggingIn.current = false;
          }
        }
        return account;
      },
      autoConnect: async () => {
        requestDirectAccount(connectorRef.current).catch((e: any) => {
          context.emit('btcLoginError');
        });
      },
      logout: () => {
        const accountId = accounts?.[0];
        if (!accountId) return;
        disconnect?.();
        context.emit('btcLogOut');
      },
      account: accounts?.[0],
      getPublicKey: () => {
        return publicKey.current;
      },
      signMessage: (msg: string) => {
        return signMessageFn.current(msg);
      },
      getContext: () => {
        return context;
      },
      getNetwork,
      switchNetwork,
      sendBitcoin,
    };
  }, [
    accounts,
    getNetwork,
    switchNetwork,
    sendBitcoin,
    openConnectModal,
    requestDirectAccount,
    context,
    disconnect,
  ]);

  return hook;
}
