import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ConnectProvider as BTCConnectProvider } from '../context';
import { UnisatConnector, OKXConnector } from '../connector'
import { useBTCProvider, useConnectModal } from '../hooks'

import ComfirmBox from './confirmBox';

const WalletSelectorContext =
  React.createContext<any>(null);

export function BtcWalletSelectorContextProvider({ children }: { children: React.ReactNode }) {
  const [isProcessing, setIsProcessing] = useState(false)

  const walletSelectorContextValue = useMemo(() => {
    return {
      setIsProcessing,
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
  </BTCConnectProvider>
  </WalletSelectorContext.Provider>
}

export function useBtcWalletSelector() {
  // @ts-ignore
  const { openConnectModal, openConnectModalAsync, disconnect } = useConnectModal();
  const { accounts, sendBitcoin, getPublicKey, provider, signMessage } = useBTCProvider();
  const publicKey = useRef<any>(null)
  const signMessageFn = useRef<any>(null)
  const [updater, setUpdater] = useState<any>(1)
  const context = useContext(WalletSelectorContext);
  
  useEffect(() => {
    if (provider) {
      getPublicKey().then((res) => {
        publicKey.current = res
      })
    }
  }, [provider, updater])

  useEffect(() => {
    signMessageFn.current = signMessage
  }, [signMessage])

  return {
    login: async () => {
      setUpdater(updater + 1)
      if (openConnectModal) {
        await openConnectModal()
        
      }

      return null
    },
    logout: () => {
      disconnect && disconnect()
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
    }
  }
}

function sleep(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

