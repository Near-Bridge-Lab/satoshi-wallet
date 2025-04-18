import { create, StoreApi } from 'zustand';
import { priceServices } from '@/services/price';
import { TOKEN_WHITE_LIST } from '@/config';
import { sleep, storageStore } from '@/utils/common';
import { nearServices } from '@/services/near';
import { isEqual } from 'lodash-es';

const storage = storageStore('tokens');

type State = {
  tokens?: string[];
  addToken: (token: string) => void;
  hiddenTokens?: string[];
  setHiddenTokens?: (hiddenTokens: string[]) => void;
  displayableTokens?: string[];
  tokenMeta: Record<string, TokenMetadata | undefined>;
  setTokenMeta: (tokenMeta: Record<string, TokenMetadata | undefined>) => void;
  prices: Record<string, string>;
  balances?: Record<string, string>;
  refreshBalance: (token: string) => void;
};

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
    const mergedTokenMeta = { ...get().tokenMeta, ...tokenMeta };
    storage?.set('tokenMeta', mergedTokenMeta);
    set({ tokenMeta: mergedTokenMeta });
  },
  prices: {},
  balances: {},
  refreshBalance: (token) => {
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

function subscribeTokensChange(store: StoreApi<State>) {
  const initState = store.getState();

  if (initState.tokens?.length) {
    queryTokenMetadata(initState.tokens)?.then((tokenMeta) => {
      initState.setTokenMeta(tokenMeta || {});
    });
  }

  store.subscribe(async (state, prevState) => {
    if (state.tokens && !isEqual(state.tokens, prevState.tokens)) {
      const tokenMeta = await queryTokenMetadata(state.tokens);
      state.setTokenMeta(tokenMeta || {});
      setDisplayableTokens();
    }
  });
}

function setDisplayableTokens() {
  const { tokens, hiddenTokens } = useTokenStore.getState();
  const displayableTokens = tokens?.filter((token) => !hiddenTokens?.includes(token));
  useTokenStore.setState({ displayableTokens });
}

function queryTokenMetadata(tokens: string[]) {
  try {
    const unFetchedTokens = tokens?.filter((token) => !useTokenStore.getState().tokenMeta?.[token]);
    return nearServices.queryTokenMetadata(unFetchedTokens);
  } catch (error) {
    console.error(error);
  }
}

function pollingQueryPrice(store: StoreApi<State>) {
  priceServices.queryPrices().then((prices) => {
    store.setState({ prices });
  });
  setTimeout(() => pollingQueryPrice(store), 60000);
}

async function pollingQueryBalance(store: StoreApi<State>) {
  await sleep(1000);
  const { displayableTokens } = store.getState();
  if (displayableTokens?.length) {
    const res = await Promise.all(displayableTokens.map((token) => nearServices.getBalance(token)));
    const balances = displayableTokens.reduce(
      (acc, token, index) => {
        acc[token] = res[index];
        return acc;
      },
      {} as Record<string, string>,
    );
    store.setState({ balances });
  }
  setTimeout(
    () => pollingQueryBalance(store),
    process.env.NODE_ENV === 'development' ? 120000 : 30000,
  );
}

async function initializeStore() {
  try {
    await subscribeTokensChange(useTokenStore);
    pollingQueryPrice(useTokenStore);
    pollingQueryBalance(useTokenStore);
  } catch (error) {
    console.error('initialize store failed:', error);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    initializeStore();
  });
}
