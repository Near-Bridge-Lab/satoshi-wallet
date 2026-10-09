import { useVisibilityStore } from '@/stores/visibility';

interface PollOptions {
  /** Delay between two runs while the wallet stays visible. */
  interval: number;
  /** Minimum time since the previous run before showing the wallet triggers another one. */
  minGap?: number;
}

/**
 * Runs `task` only while the wallet is visible: right away when it becomes visible (deferred until
 * `minGap` has passed since the previous run), then every `interval`. Runs never overlap and a
 * failed run does not stop the loop.
 */
export function pollWhileVisible(
  task: () => Promise<unknown>,
  { interval, minGap = interval }: PollOptions,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRunAt = 0;
  let isRunning = false;

  const schedule = (delay: number) => {
    timer = setTimeout(run, delay);
  };

  async function run() {
    isRunning = true;
    lastRunAt = Date.now();
    try {
      await task();
    } catch (error) {
      console.error(error);
    } finally {
      isRunning = false;
    }
    if (useVisibilityStore.getState().isVisible) schedule(interval);
  }

  const sync = (isVisible: boolean) => {
    clearTimeout(timer);
    if (isVisible && !isRunning) schedule(Math.max(0, lastRunAt + minGap - Date.now()));
  };

  sync(useVisibilityStore.getState().isVisible);
  useVisibilityStore.subscribe((state, prevState) => {
    if (state.isVisible !== prevState.isVisible) sync(state.isVisible);
  });
}
