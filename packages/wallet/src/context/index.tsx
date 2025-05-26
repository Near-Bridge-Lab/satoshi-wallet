import { SmartAccount, type AAOptions, type AccountContract } from '@particle-network/aa';
import { chains } from '@particle-network/chains';
import { walletEntryPlugin, type WalletOption } from '@particle-network/wallet';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ConnectModal from '../components/connectModal';
import SignModal from '../components/signModal';
import { type BaseConnector } from '../connector/base';
import { AASignerProvider } from '../evmSigner';
import useModalStateValue from '../hooks/useModalStateValue';
import { EventName } from '../types/eventName';
import { checkBTCVersion, storageStore } from '../utils';

import events from '../utils/eventUtils';
import txConfirm from '../utils/txConfirmUtils';

interface GlobalState {
  connectorId?: string;
  setConnectorId: (connectorId?: string) => void;
  connector?: BaseConnector;
  connectors: BaseConnector[];
  connectModalOpen: boolean;
  openConnectModal: () => void;
  closeConnectModal: () => void;
  accounts: string[];
  provider: any;
  disconnect: () => void;
  requestDirectAccount: (connector: BaseConnector) => any;
  getPublicKey: () => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  evmAccount?: string;
  smartAccount?: SmartAccount;
  switchNetwork: (network: 'livenet' | 'testnet') => Promise<void>;
  getNetwork: () => Promise<'livenet' | 'testnet'>;
  sendBitcoin: (
    toAddress: string,
    satoshis: number,
    options?: { feeRate: number },
  ) => Promise<string>;
  accountContract: AccountContract;
  setAccountContract: (accountContract: AccountContract) => void;
}

const ConnectContext = createContext<GlobalState>({} as any);

interface ConnectOptions {
  projectId: string;
  clientKey: string;
  appId: string;
  aaOptions: AAOptions;
  rpcUrls?: Record<number, string>;
  walletOptions?: Omit<WalletOption, 'erc4337' | 'customStyle'> & {
    customStyle?: Omit<WalletOption['customStyle'], 'supportChains'>;
  };
}

const SAContractKey = 'particle-sa-config';

export const ConnectProvider = ({
  children,
  options,
  connectors,
  autoConnect = true,
}: {
  children: React.ReactNode;
  options: ConnectOptions;
  connectors: BaseConnector[];
  autoConnect?: boolean;
}) => {
  const {
    closeModal: closeConnectModal,
    isModalOpen: connectModalOpen,
    openModal: openConnectModal,
  } = useModalStateValue();

  const {
    closeModal: closeSignModal,
    isModalOpen: signModalOpen,
    openModal: openSignModal,
  } = useModalStateValue();

  const [connectorId, setConnectorId] = useState<string>();
  const [accounts, setAccounts] = useState<string[]>([]);
  const [evmAccount, setEVMAccount] = useState<string>();
  const [accountContract, _setAccountContract] = useState<AccountContract>({
    name: Object.keys(options.aaOptions.accountContracts)?.[0] || 'BTC',
    version:
      options.aaOptions.accountContracts[
        Object.keys(options.aaOptions.accountContracts)?.[0] || 'BTC'
      ]?.[0].version || '1.0.0',
  });

  const getConnectorId = useCallback(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    const id = storageStore()?.get<string>('current-connector-id');
    return id ?? '';
  }, []);

  const getConnector = useCallback(() => {
    const connectorId = getConnectorId();
    return connectors.find((item) => item.metadata.id === connectorId);
  }, [connectorId, connectors]);

  const setAccountContract = useCallback(
    (config: AccountContract) => {
      if (!checkBTCVersion(options.aaOptions.accountContracts, config.name, config.version)) {
        throw new Error('Invalid Account Contract');
      }
      localStorage.setItem(SAContractKey, JSON.stringify(config));
      _setAccountContract(config);
    },
    [options.aaOptions.accountContracts, _setAccountContract],
  );

  useEffect(() => {
    const connectorId = getConnectorId();
    if (connectorId) {
      setConnectorId(connectorId);
    }
  }, [autoConnect, getConnectorId]);

  const evmSupportChainIds = useMemo(() => {
    let chainIds = options.aaOptions.accountContracts[accountContract.name]
      ?.filter((item) => item.version === accountContract.version)
      .map((item) => item.chainIds)
      .reduce((a, b) => {
        a.push(...b);
        return a;
      }, []);
    chainIds = Array.from(new Set(chainIds || []));
    return chainIds;
  }, [options.aaOptions.accountContracts, accountContract]);

  const connector = useMemo(() => getConnector(), [connectorId, connectors]);

  const getPublicKey = useCallback(async () => {
    const connector = getConnector();
    if (!connector) {
      throw new Error('Wallet not connected!');
    }
    const pubKey = await connector.getPublicKey();
    return pubKey;
  }, [getConnector]);

  const signMessage = useCallback(
    async (message: string) => {
      if (!connector) {
        throw new Error('Wallet not connected!');
      }
      const signature = await connector.signMessage(message);
      return signature;
    },
    [connector],
  );

  const sendBitcoin = useCallback(
    async (toAddress: string, satoshis: number, options?: { feeRate: number }) => {
      if (!connector) {
        throw new Error('Wallet not connected!');
      }

      const signature = await connector.sendBitcoin(toAddress, satoshis, options);
      return signature;
    },
    [connector],
  );

  const getNetwork = useCallback(async () => {
    if (!connector) {
      throw new Error('Wallet not connected!');
    }
    const network = await connector.getNetwork();
    return network;
  }, [connector]);

  const switchNetwork = useCallback(
    async (network: 'livenet' | 'testnet') => {
      if (!connector) {
        throw new Error('Wallet not connected!');
      }
      await connector.switchNetwork(network);
    },
    [connector],
  );

  const smartAccount = useMemo(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (
      !(window as any).__bitcoinSmartAccount ||
      ((window as any)?.__bitcoinSmartAccount &&
        ((window as any)?.__bitcoinSmartAccount.smartAccountContract.version !==
          accountContract.version ||
          (window as any)?.__bitcoinSmartAccount.smartAccountContract.name !==
            accountContract.name))
    ) {
      const smartAccount = new SmartAccount(
        new AASignerProvider(
          evmSupportChainIds,
          options.projectId,
          options.clientKey,
          options.rpcUrls,
        ) as any,
        options,
      );
      smartAccount.setSmartAccountContract(accountContract);
      (window as any).__bitcoinSmartAccount = smartAccount;
    }
    (window as any).__bitcoinSmartAccount.provider.getPublicKey = getPublicKey;
    (window as any).__bitcoinSmartAccount.provider.personalSign = signMessage;
    return (window as any).__bitcoinSmartAccount as SmartAccount;
  }, [options, evmSupportChainIds, getPublicKey, signMessage, accountContract]);

  const requestAccount = useCallback(
    async (connector: BaseConnector) => {
      let accounts = await connector.getAccounts();
      if (accounts.length === 0 && autoConnect) {
        accounts = await connector.requestAccounts();
      }
      setAccounts(accounts);
    },
    [autoConnect],
  );

  const requestDirectAccount = useCallback(async (connector: BaseConnector) => {
    let accounts = await connector.getAccounts();
    if (accounts.length === 0) {
      accounts = await connector.requestAccounts();
    }
    setAccounts(accounts);

    return accounts;
  }, []);

  useEffect(() => {
    if (connector) {
      requestAccount(connector).catch((e: any) => {
        console.error('get account error', e);

        setAccounts([]);
      });
    } else {
      setAccounts([]);
    }
  }, [connector, requestAccount]);

  useEffect(() => {
    const onAccountChange = (accounts: string[]) => {
      if (!accounts.length) return;
      setAccounts(accounts);
    };
    connector?.on('accountsChanged', onAccountChange);
    return () => {
      connector?.removeListener('accountsChanged', onAccountChange);
    };
  }, [connector]);

  const provider = useMemo(() => {
    if (connectorId) {
      return connectors.find((item) => item.metadata.id === connectorId)?.getProvider();
    }
  }, [connectorId, connectors]);

  const disconnect = useCallback(() => {
    storageStore()?.remove('current-connector-id');
    txConfirm.reset();
    if (connector) {
      connector.disconnect();
    }
    setConnectorId(undefined);
  }, [connector]);

  useEffect(() => {
    const config = JSON.parse(localStorage.getItem(SAContractKey) || '{}');
    if (
      config.name &&
      config.version &&
      checkBTCVersion(options.aaOptions.accountContracts, config.name, config.version)
    ) {
      _setAccountContract(config);
    }
  }, [options.aaOptions.accountContracts, _setAccountContract]);

  useEffect(() => {
    if (options.walletOptions?.visible !== false) {
      const supportChains = evmSupportChainIds.map((id) => chains.getEVMChainInfoById(id));
      if (supportChains.some((chain) => !chain)) {
        throw new Error(`Please config valid chain ids, ${JSON.stringify(evmSupportChainIds)}`);
      }
      walletEntryPlugin.init(
        {
          projectId: options.projectId,
          clientKey: options.clientKey,
          appId: options.appId,
        },
        {
          ...options.walletOptions,
          erc4337: accountContract,
          customStyle: {
            ...options.walletOptions?.customStyle,
            supportChains: supportChains as any,
          },
        },
      );
    }
  }, [options, evmSupportChainIds, accountContract]);

  useEffect(() => {
    if (smartAccount && options.walletOptions?.visible !== false) {
      walletEntryPlugin.setWalletCore({
        ethereum: smartAccount.provider,
      });
    }
  }, [smartAccount, options]);

  useEffect(() => {
    if (options.walletOptions?.visible !== false) {
      if (evmAccount) {
        walletEntryPlugin.walletEntryCreate();
      } else {
        walletEntryPlugin.walletEntryDestroy();
      }
    }
  }, [evmAccount, smartAccount, options]);

  useEffect(() => {
    if (accounts.length === 0) {
      closeConnectModal();
      closeSignModal();
      if (events.listenerCount(EventName.sendUserOpResult) > 0) {
        events.emit(EventName.sendUserOpResult, {
          error: {
            code: -32600,
            message: 'Wallet disconnected',
          },
        });
      } else if (events.listenerCount(EventName.personalSignResult) > 0) {
        events.emit(EventName.personalSignResult, {
          error: {
            code: -32600,
            message: 'Wallet disconnected',
          },
        });
      } else if (events.listenerCount(EventName.signTypedDataResult) > 0) {
        events.emit(EventName.signTypedDataResult, {
          error: {
            code: -32600,
            message: 'Wallet disconnected',
          },
        });
      }
    }
  }, [accounts, closeConnectModal, closeSignModal]);

  return (
    <ConnectContext.Provider
      value={{
        connectorId,
        setConnectorId,
        connector,
        connectors,
        connectModalOpen,
        openConnectModal,
        closeConnectModal,
        accounts,
        provider,
        disconnect,
        requestDirectAccount,
        getPublicKey,
        signMessage,
        evmAccount,
        smartAccount,
        getNetwork,
        switchNetwork,
        sendBitcoin,
        accountContract: accountContract,
        setAccountContract: setAccountContract,
      }}
    >
      {children}
      <ConnectModal open={connectModalOpen} onClose={closeConnectModal} />
      <SignModal open={signModalOpen} onClose={closeSignModal} onOpen={openSignModal} />
    </ConnectContext.Provider>
  );
};

export const useConnectProvider = () => {
  const context = useContext(ConnectContext);
  return context;
};
