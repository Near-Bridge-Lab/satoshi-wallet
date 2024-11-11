import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ConnectProvider as BTCConnectProvider } from '../context';
import { UnisatConnector, OKXConnector } from '../connector'
import { useBTCProvider, useConnectModal } from '../hooks'

import ComfirmBox from './confirmBox';
import { InitContextHook } from './hook';

const WalletSelectorContext =
  React.createContext<any>(null);

export function BtcWalletSelectorContextProvider({ children, autoConnect = false }: { children: React.ReactNode, autoConnect?: boolean }) {
  const [isProcessing, setIsProcessing] = useState(false)

  const walletSelectorContextValue = useMemo(() => {
    const simpleFn: any = {}

    return {
      setIsProcessing,
      emit: (eventName: string, e: any) => {
        if (simpleFn[eventName] && simpleFn[eventName].length) {
          simpleFn[eventName].forEach((fn: (e: any) => void) => {
            fn(e)
          })
        }
      },
      on: (eventName: string, fn: (e: any) => void) => {
        simpleFn[eventName] = simpleFn[eventName] || []
        simpleFn[eventName].push(fn)
      },
    }
  }, [])

  return <WalletSelectorContext.Provider value={walletSelectorContextValue}><BTCConnectProvider
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
    connectors={[new UnisatConnector()]}
  >
    {children}
    {
      isProcessing && <ComfirmBox hash={''} status={0} onClose={() => {
        setIsProcessing(false)
      }}/>
    }
    <InitContextHook />
  </BTCConnectProvider>
  </WalletSelectorContext.Provider>
}

export function useBtcWalletSelector() {
  // @ts-ignore
  const { openConnectModal, openConnectModalAsync, disconnect, requestDirectAccount } = useConnectModal();
  const { accounts, sendBitcoin, getPublicKey, provider, signMessage, connector } = useBTCProvider();
  const publicKey = useRef<any>(null)
  const signMessageFn = useRef<any>(null)
  const connectorRef = useRef<any>(null)
  const providerRef = useRef<any>(null)
  const [updater, setUpdater] = useState<any>(1)
  const context = useContext(WalletSelectorContext);
  
  useEffect(() => {
    if (provider) {
      getPublicKey().then((res) => {
        publicKey.current = res
      })
      providerRef.current = provider
    }
  }, [provider, updater])

  useEffect(() => {
    signMessageFn.current = signMessage
  }, [signMessage])

  useEffect(() => {
    const fn = (account: any) => {
      if (account) {
        getPublicKey().then((res) => {
          publicKey.current = res
          context.emit('updatePublicKey', res)
        })
      }
    }

    if (connector) {
      connector.on('accountsChanged', fn)
    }
    connectorRef.current = connector

    return () => {
      if (connector) {
        connector.removeListener('accountsChanged', fn)
      }
    }
  }, [connector])

  return {
    login: async () => {
      const account = accounts && accounts.length ? accounts[0] : null
      if (account) {
        return account
      }
      setUpdater(updater + 1)
      if (openConnectModal) {
        await openConnectModal()
      }

      return null
    },
    autoConnect: async () => {
      let times = 0
      while (!connectorRef.current) {
        await sleep(500)
        if (times++ > 10) {
          return null
        }
      }
      requestDirectAccount(connectorRef.current).catch((e: any) => {
        context.emit('btcLoginError')
      });
      
    },
    logout: () => {
      disconnect && disconnect()
      context.emit('btcLogOut')
    },
    account: accounts && accounts.length ? accounts[0] : null,
    getPublicKey: async () => {
      let times = 0
      while (!publicKey.current) {
        await sleep(1000)
        if (times++ > 10) {
          return null
        }
      }

      return publicKey.current
    },
    signMessage: (msg: string) => {
      return signMessageFn.current(msg)
    },
    getContext: () => {
      return context
    },
    getBalance: async () => {
      let times = 0
      while (!providerRef.current) {
        await sleep(500)
        if (times++ > 10) {
          return null
        }
      }

      const { total } = await providerRef.current.getBalance()
      return total
    }
  }
}

function sleep(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

