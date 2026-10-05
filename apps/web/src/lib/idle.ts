/**
 * Small helpers for keeping long work out of the way of the person using the page. Browsers
 * that lack `scheduler.yield` or `requestIdleCallback` (Safari, older Firefox) get a timer.
 */

interface Scheduler {
  yield?: () => Promise<void>;
}

/**
 * Ends the current task and continues in a new one, so the browser can paint and handle input
 * in between. Use it between the steps of a long job.
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: Scheduler }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs `task` when the main thread is idle, at the latest after `timeout` milliseconds.
 * Returns a function that cancels it.
 */
export function whenIdle(task: () => void, timeout: number): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(task, { timeout });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, Math.min(timeout, 50));
  return () => clearTimeout(handle);
}
