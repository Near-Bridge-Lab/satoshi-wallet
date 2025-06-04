import { create, StoreApi } from 'zustand';
import { priceServices } from '@/services/price';
import { TOKEN_WHITE_LIST } from '@/config';
import { storageStore } from '@/utils/common';
import { isEqual } from 'lodash-es';
import { nearServices } from '@/services/near';
import { fastNearServices } from '@/services/fastnear';

const storage = storageStore('SATOSHI_WALLET_UI_TOKENS');

type State = {
  tokens?: string[];
  addToken: (token: string) => void;
  hiddenTokens?: string[];
  setHiddenTokens?: (hiddenTokens: string[]) => void;
  displayableTokens?: string[];
  tokenMeta: Record<string, TokenMetadata | undefined>;
  setTokenMeta: (tokenMeta?: Record<string, TokenMetadata | undefined>) => void;
  prices: Record<string, { price: string; symbol: string; decimal: number }>;
  balances?: Record<string, string>;
  refreshBalance: (token: string) => void;
};

// NFT Store
type NFTState = {
  nfts: Record<string, NFTMetadata[]>;
  setNFTs: (accountId: string, nfts: NFTMetadata[]) => void;
  refreshNFTs: () => void;
  getNFTsByAccount: (accountId: string) => NFTMetadata[];
};

export const useNFTStore = create<NFTState>((set, get) => ({
  nfts: storage?.get('nfts') || {},
  setNFTs: (accountId, nfts) => {
    if (!accountId) return;
    const currentNfts = get().nfts;
    const updatedNfts = {
      ...currentNfts,
      [accountId]: nfts,
    };
    set({ nfts: updatedNfts });
    storage?.set('nfts', updatedNfts);
  },
  getNFTsByAccount: (accountId) => {
    if (!accountId) return [];
    return get().nfts[accountId] || [];
  },
  refreshNFTs: async () => {
    const accountId = nearServices.getNearAccountId();
    if (!accountId) return;

    try {
      const data = await fastNearServices.getAccountNFTs(accountId);
      if (data?.length && Array.isArray(data)) {
        get().setNFTs(accountId, data);
      }
    } catch (error) {
      console.error('Failed to fetch NFTs from FastNear:', error);
    }
  },
}));

export const useTokenStore = create<State>((set, get) => ({
  tokens: storage?.get('tokens') || TOKEN_WHITE_LIST,
  hiddenTokens: storage?.get('hiddenTokens') || [],
  tokenMeta: storage?.get('tokenMeta') || {},
  addToken: (token) => {
    const tokens = get().tokens;
    if (!tokens?.includes(token)) {
      const updatedTokens = [...(tokens || []), token];
      set({ tokens: updatedTokens });
      storage?.set('tokens', updatedTokens);
      setDisplayableTokens();
    }
  },
  setHiddenTokens: (hiddenTokens) => {
    storage?.set('hiddenTokens', hiddenTokens);
    set({ hiddenTokens });
    setDisplayableTokens();
  },
  displayableTokens: (storage?.get<string[]>('tokens') || TOKEN_WHITE_LIST).filter(
    (token) => !storage?.get<string[]>('hiddenTokens')?.includes(token),
  ),
  setTokenMeta: (tokenMeta) => {
    const mergedTokenMeta = { ...get().tokenMeta, ...(tokenMeta || {}) };
    storage?.set('tokenMeta', mergedTokenMeta);
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

function setDisplayableTokens() {
  const { tokens, hiddenTokens } = useTokenStore.getState();
  const displayableTokens = (tokens || []).filter((token) => !hiddenTokens?.includes(token));
  useTokenStore.setState({ displayableTokens });
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
  let existingTokens = store.getState().tokens || [];
  const accountId = nearServices.getNearAccountId();

  try {
    if (accountId) {
      const data = await fastNearServices.getAccountTokens(accountId);

      if (data && Array.isArray(data)) {
        const heldTokens = data.map((t: any) => t.contract_id);

        const newTokens = heldTokens.filter((token: string) => !existingTokens.includes(token));

        if (newTokens.length > 0) {
          const updatedTokens = [...existingTokens, ...newTokens];
          store.setState({ tokens: updatedTokens });
          storage?.set('tokens', updatedTokens);
          existingTokens = updatedTokens;
          setDisplayableTokens();
        }
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
      setDisplayableTokens();
    }
  });
}

async function pollingQueryPrice(store: StoreApi<State>) {
  const { tokenMeta } = store.getState();
  if (tokenMeta) {
    // const symbols = Object.values(tokenMeta).map((meta) => meta?.symbol || '');
    const prices = await priceServices.queryPrices();
    store.setState({ prices });
  }
  setTimeout(() => pollingQueryPrice(store), 30000);
}

async function pollingQueryBalance(store: StoreApi<State>) {
  const { displayableTokens } = store.getState();
  const accountId = nearServices.getNearAccountId();

  if (displayableTokens?.length && accountId) {
    try {
      const balanceRes = await Promise.all(
        displayableTokens.map((token) => nearServices.getBalance(token)),
      );
      const balances = displayableTokens.reduce(
        (acc, token, index) => {
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
  const accountId = nearServices.getNearAccountId();
  if (accountId) {
    store.getState().refreshNFTs();
  }
  setTimeout(() => pollingQueryNFTs(store), 600000);
}

async function initializeStore() {
  try {
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
