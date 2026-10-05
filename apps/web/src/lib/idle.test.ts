import { afterEach, describe, expect, it, vi } from 'vitest';
import { whenIdle, yieldToMain } from './idle.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('yieldToMain', () => {
  it('uses scheduler.yield when the browser has it', async () => {
    const yielded = vi.fn(() => Promise.resolve());
    vi.stubGlobal('scheduler', { yield: yielded });
    await yieldToMain();
    expect(yielded).toHaveBeenCalledOnce();
  });

  it('falls back to a timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('scheduler', undefined);
    let done = false;
    const pending = yieldToMain().then(() => (done = true));
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
  });
});

describe('whenIdle', () => {
  it('passes the timeout to requestIdleCallback and can cancel', () => {
    const request = vi.fn(() => 7);
    const cancel = vi.fn();
    vi.stubGlobal('requestIdleCallback', request);
    vi.stubGlobal('cancelIdleCallback', cancel);
    const task = vi.fn();
    const stop = whenIdle(task, 2000);
    expect(request).toHaveBeenCalledWith(task, { timeout: 2000 });
    stop();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it('uses a short timer without requestIdleCallback, and can cancel it', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const task = vi.fn();
    whenIdle(task, 2000);
    vi.advanceTimersByTime(60);
    expect(task).toHaveBeenCalledOnce();

    const cancelled = vi.fn();
    whenIdle(cancelled, 2000)();
    vi.advanceTimersByTime(60);
    expect(cancelled).not.toHaveBeenCalled();
  });
});
