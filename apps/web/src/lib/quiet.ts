/**
 * "The page has settled": nothing has been fetched, no task has run long and nobody has touched
 * or scrolled the page for a while. Work that can wait (starting the map) is better done then
 * than while the first data, the service worker's own downloads or a scroll are in progress.
 */

/** What `whenPageQuiet` needs from the browser. Replaced in tests. */
export interface QuietEnvironment {
  /** Milliseconds on the page's clock (performance.now). */
  now(): number;
  setTimeout(task: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /**
   * Calls `onActivity` with the page-clock time at which each network response and each long
   * task ended, including the ones that already happened. Returns a function that stops it.
   */
  watchPerformance(onActivity: (endedAt: number) => void): () => void;
  /** Calls `onInput` for every touch, key press, wheel turn and scroll. Returns a stop function. */
  watchInput(onInput: () => void): () => void;
  visible(): boolean;
  /** Calls `onChange` whenever the page is shown or hidden. Returns a stop function. */
  watchVisibility(onChange: () => void): () => void;
}

export interface QuietOptions {
  /** How long nothing may happen. */
  readonly quietMs: number;
  /** Start anyway this long after asking, however busy the page is. */
  readonly maxWaitMs: number;
}

const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'scroll'] as const;

export const browserEnvironment: QuietEnvironment = {
  now: () => performance.now(),
  setTimeout: (task, ms) => setTimeout(task, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  watchPerformance(onActivity) {
    const observers: PerformanceObserver[] = [];
    for (const type of ['resource', 'longtask']) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) onActivity(entry.startTime + entry.duration);
        });
        // `buffered`: what happened before this was called counts too.
        observer.observe({ type, buffered: true });
        observers.push(observer);
      } catch {
        // This entry type is not supported here: the other signals still work.
      }
    }
    return () => observers.forEach((observer) => observer.disconnect());
  },
  watchInput(onInput) {
    // Capture: scroll events do not bubble, and elements inside the page scroll too.
    for (const type of INPUT_EVENTS) {
      document.addEventListener(type, onInput, { capture: true, passive: true });
    }
    return () => {
      for (const type of INPUT_EVENTS) document.removeEventListener(type, onInput, true);
    };
  },
  visible: () => document.visibilityState === 'visible',
  watchVisibility(onChange) {
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  },
};

/**
 * Runs `task` once the page has been quiet for `quietMs` while it is visible, or `maxWaitMs`
 * after the call at the latest (if the page is visible by then). A page that is ready but hidden
 * waits for the next visibility change instead of polling. Returns a function that cancels it.
 */
export function whenPageQuiet(
  task: () => void,
  options: QuietOptions,
  env: QuietEnvironment = browserEnvironment,
): () => void {
  const { quietMs, maxWaitMs } = options;
  const asked = env.now();
  let lastActivity = asked;
  let timer: unknown;
  let stopped = false;

  const stopWatching = [
    env.watchPerformance((endedAt) => {
      lastActivity = Math.max(lastActivity, endedAt);
    }),
    env.watchInput(() => {
      lastActivity = env.now();
    }),
    // A hidden page is not polled: it is looked at again when it is shown.
    env.watchVisibility(() => {
      if (!stopped && env.visible()) {
        env.clearTimeout(timer);
        check();
      }
    }),
  ];

  const stop = () => {
    stopped = true;
    env.clearTimeout(timer);
    for (const stopOne of stopWatching) stopOne();
  };

  const check = () => {
    if (stopped) return;
    const now = env.now();
    const quiet = now - lastActivity >= quietMs;
    const overdue = now - asked >= maxWaitMs;
    if ((quiet || overdue) && env.visible()) {
      stop();
      task();
      return;
    }
    // Ready but hidden: nothing to schedule, the visibility watcher calls this again.
    if (quiet || overdue) return;
    // Look again when it could be quiet (or overdue).
    const untilQuiet = quietMs - (now - lastActivity);
    const untilOverdue = maxWaitMs - (now - asked);
    timer = env.setTimeout(check, Math.max(Math.min(untilQuiet, untilOverdue), 50));
  };
  timer = env.setTimeout(check, quietMs);
  return stop;
}
