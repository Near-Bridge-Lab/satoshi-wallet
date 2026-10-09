import { create } from 'zustand';

type VisibilityState = {
  /** Whether the wallet UI is currently on screen. */
  isVisible: boolean;
  /** Whether the wallet UI has been on screen at least once since this page loaded. */
  hasShown: boolean;
};

export const useVisibilityStore = create<VisibilityState>(() => ({
  isVisible: false,
  hasShown: false,
}));

const COLLAPSE_CHECK_INTERVAL = 1000;

/**
 * The host closes the wallet by hiding its iframe with `display: none`, which keeps timers and
 * network requests running and leaves `document.visibilityState` untouched. Browsers report a
 * hidden iframe differently, so several signals are combined:
 * - IntersectionObserver reports both hide and show in Chromium/WebKit, but only show in Firefox.
 * - `innerWidth` collapses to 0 in some browsers (e.g. Firefox), but stays stale in others.
 * - `resize` fires whenever the iframe is shown again.
 * Firefox emits nothing when the iframe collapses, so the viewport is checked periodically
 * while the wallet is visible.
 * Browsers also pause intersection updates while the whole page is hidden, so the value cached
 * before that may be outdated: it is discarded and observed again when the page becomes visible.
 */
function trackVisibility() {
  let isIntersecting = false;
  let collapseWatcher: ReturnType<typeof setInterval> | undefined;

  const update = () => {
    const isVisible =
      isIntersecting && document.visibilityState === 'visible' && window.innerWidth > 0;
    if (isVisible === useVisibilityStore.getState().isVisible) return;

    useVisibilityStore.setState((state) => ({ isVisible, hasShown: state.hasShown || isVisible }));
    clearInterval(collapseWatcher);
    collapseWatcher = isVisible ? setInterval(update, COLLAPSE_CHECK_INTERVAL) : undefined;
  };

  const root = document.documentElement;
  const observer = new IntersectionObserver((entries) => {
    isIntersecting = entries[entries.length - 1].isIntersecting;
    update();
  });
  observer.observe(root);

  window.addEventListener('resize', update);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      isIntersecting = false;
      observer.unobserve(root);
      observer.observe(root);
    }
    update();
  });
}

if (typeof window !== 'undefined') {
  trackVisibility();
}

export function waitForFirstShow() {
  return new Promise<void>((resolve) => {
    if (useVisibilityStore.getState().hasShown) return resolve();

    const unsubscribe = useVisibilityStore.subscribe((state) => {
      if (!state.hasShown) return;
      unsubscribe();
      resolve();
    });
  });
}
