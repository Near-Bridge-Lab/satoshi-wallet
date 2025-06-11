import { create, StoreApi } from 'zustand';
import { priceServices } from '@/services/price';
import { NEAR_TOKEN_CONTRACT, TOKEN_WHITE_LIST } from '@/config';
import { storageStore } from '@/utils/common';
import { isEqual } from 'lodash-es';
import { nearServices } from '@/services/near';
import { fastNearServices } from '@/services/fastnear';
import { formatFileUrl } from '@/utils/format';
import { useWalletStore } from '@/stores/wallet';

const tokensStorage = storageStore('SATOSHI_WALLET_UI_TOKENS');

function getAccountStorage(accountId: string) {
  return storageStore(`SATOSHI_WALLET_UI_TOKENS_${accountId}`);
}

function getCurrentAccountId(): string | undefined {
  return useWalletStore.getState().accountId;
}

type State = {
  tokens?: string[];
  addToken: (token: string) => void;
  displayTokens?: string[];
  setDisplayTokens?: (displayTokens: string[]) => void;
  tokenMeta: Record<string, TokenMetadata | undefined>;
  setTokenMeta: (tokenMeta?: Record<string, TokenMetadata | undefined>) => void;
  prices: Record<string, { price: string; symbol: string; decimal: number }>;
  balances?: Record<string, string>;
  refreshBalance: (token: string) => void;
};

type NFTState = {
  nfts: NFTMetadata[];
  setNFTs: (nfts: NFTMetadata[]) => void;
  refreshNFTs: () => void;
};

export const useNFTStore = create<NFTState>((set, get) => ({
  nfts: [],
  setNFTs: (nfts) => {
    const accountId = getCurrentAccountId();
    if (!accountId) return;

    set({ nfts });
    const storage = getAccountStorage(accountId);
    storage?.set('nfts', nfts);
  },
  refreshNFTs: async () => {
    const accountId = getCurrentAccountId();
    if (!accountId) return;

    try {
      const data = await fastNearServices.getAccountNFTs(accountId);
      if (data?.length && Array.isArray(data)) {
        get().setNFTs(data);
      }
    } catch (error) {
      console.error('Failed to fetch NFTs from FastNear:', error);
    }
  },
}));

export const useTokenStore = create<State>((set, get) => ({
  tokens: TOKEN_WHITE_LIST,
  displayTokens: TOKEN_WHITE_LIST,
  tokenMeta: tokensStorage?.get('tokenMeta') || {},
  addToken: (token) => {
    const accountId = getCurrentAccountId();
    if (!accountId) return;

    const tokens = get().tokens;
    const displayTokens = get().displayTokens;

    if (!tokens?.includes(token)) {
      const updatedTokens = [...(tokens || []), token];
      const updatedDisplayTokens = [...(displayTokens || []), token];

      set({ tokens: updatedTokens, displayTokens: updatedDisplayTokens });

      const storage = getAccountStorage(accountId);
      storage?.set('tokens', updatedTokens);
      storage?.set('displayTokens', updatedDisplayTokens);
    }
  },
  setDisplayTokens: (displayTokens) => {
    const accountId = getCurrentAccountId();
    if (!accountId) return;

    const storage = getAccountStorage(accountId);
    storage?.set('displayTokens', displayTokens);
    set({ displayTokens });
  },
  setTokenMeta: (tokenMeta) => {
    const mergedTokenMeta = { ...get().tokenMeta, ...(tokenMeta || {}) };
    if (mergedTokenMeta?.[NEAR_TOKEN_CONTRACT]) {
      mergedTokenMeta[NEAR_TOKEN_CONTRACT] = {
        ...mergedTokenMeta[NEAR_TOKEN_CONTRACT],
        icon: formatFileUrl('/assets/crypto/wnear.png'),
        name: 'Wrapped NEAR',
        symbol: 'wNEAR',
        decimals: 24,
      };
    }
    tokensStorage?.set('tokenMeta', mergedTokenMeta);
    set({ tokenMeta: mergedTokenMeta });
  },
  prices: {},
  balances: {},
  refreshBalance: async (token) => {
    nearServices.getBalance(token).then((balance) => {
      set((state) => {
        return (state.balances = {
          ...state.balances,
          [token]: balance,
        });
      });
    });
  },
}));

function loadAccountData(accountId: string) {
  const storage = getAccountStorage(accountId);
  const tokens = (storage?.get('tokens') as string[]) || TOKEN_WHITE_LIST;
  const displayTokens = (storage?.get('displayTokens') as string[]) || TOKEN_WHITE_LIST;

  useTokenStore.setState({
    tokens,
    displayTokens,
  });
}

function subscribeWalletChange() {
  let currentAccountId = getCurrentAccountId();

  if (currentAccountId) {
    loadAccountData(currentAccountId);
  }

  useWalletStore.subscribe((state, prevState) => {
    if (state.accountId !== prevState.accountId) {
      if (state.accountId) {
        loadAccountData(state.accountId);
        currentAccountId = state.accountId;
      } else {
        useTokenStore.setState({
          tokens: TOKEN_WHITE_LIST,
          displayTokens: TOKEN_WHITE_LIST,
        });
        currentAccountId = undefined;
      }
    }
  });
}

async function queryTokenMetadata(tokens: string[]) {
  try {
    const unFetchedTokens = tokens?.filter((token) => !useTokenStore.getState().tokenMeta?.[token]);
    return nearServices.queryTokenMetadata(unFetchedTokens) as Promise<
      Record<string, TokenMetadata | undefined> | undefined
    >;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

async function subscribeTokensChange(store: StoreApi<State>) {
  const accountId = getCurrentAccountId();
  if (!accountId) return;

  const storage = getAccountStorage(accountId);
  let existingTokens = store.getState().tokens || [];

  try {
    const data = await fastNearServices.getAccountTokens(accountId);

    if (data && Array.isArray(data)) {
      const heldTokens = data.map((t: any) => t.contract_id);
      heldTokens.unshift('near');

      const newTokens = heldTokens.filter((token: string) => !existingTokens.includes(token));

      if (newTokens.length > 0) {
        const updatedTokens = [...existingTokens, ...newTokens];
        const currentDisplayTokens = store.getState().displayTokens || [];
        const updatedDisplayTokens = [...currentDisplayTokens, ...newTokens];

        store.setState({ tokens: updatedTokens, displayTokens: updatedDisplayTokens });
        storage?.set('tokens', updatedTokens);
        storage?.set('displayTokens', updatedDisplayTokens);
        existingTokens = updatedTokens;
      }
    }
  } catch (error) {
    console.error('Failed to fetch tokens from FastNear:', error);
  }

  if (existingTokens?.length) {
    queryTokenMetadata(existingTokens)?.then((tokenMeta) => {
      store.getState().setTokenMeta(tokenMeta);
    });
  }

  store.subscribe(async (state, prevState) => {
    if (state.tokens && !isEqual(state.tokens, prevState.tokens)) {
      const tokenMeta = await queryTokenMetadata(state.tokens);
      state.setTokenMeta(tokenMeta);
    }
  });
}

async function pollingQueryPrice(store: StoreApi<State>) {
  const { tokenMeta } = store.getState();
  if (tokenMeta) {
    const prices = await priceServices.queryPrices();
    store.setState({ prices });
  }
  setTimeout(() => pollingQueryPrice(store), 30000);
}

async function pollingQueryBalance(store: StoreApi<State>) {
  const { displayTokens } = store.getState();
  const accountId = getCurrentAccountId();

  if (displayTokens?.length && accountId) {
    try {
      const balanceRes = await Promise.all(
        displayTokens.map((token: string) => nearServices.getBalance(token)),
      );
      const balances = displayTokens.reduce(
        (acc: Record<string, string>, token: string, index: number) => {
          acc[token] = balanceRes[index];
          return acc;
        },
        {} as Record<string, string>,
      );
      store.setState({ balances });
    } catch (error) {
      console.error('Failed to fetch token balances:', error);
    }
  }

  setTimeout(() => pollingQueryBalance(store), 120000);
}

async function pollingQueryNFTs(store: StoreApi<NFTState>) {
  const accountId = getCurrentAccountId();
  if (accountId) {
    store.getState().refreshNFTs();
  }
  setTimeout(() => pollingQueryNFTs(store), 600000);
}

async function initializeStore() {
  try {
    subscribeWalletChange();
    await subscribeTokensChange(useTokenStore);
    pollingQueryBalance(useTokenStore);
    pollingQueryPrice(useTokenStore);
    pollingQueryNFTs(useNFTStore);
  } catch (error) {
    console.error('initialize store failed:', error);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', initializeStore);
}
