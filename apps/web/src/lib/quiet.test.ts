import { describe, expect, it, vi } from 'vitest';
import { whenPageQuiet } from './quiet.ts';
import type { QuietEnvironment } from './quiet.ts';

/** A page clock and timers that tests move by hand. */
function fakeEnvironment() {
  let clock = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; task: () => void }>();
  let activity: ((endedAt: number) => void) | null = null;
  let input: (() => void) | null = null;
  let visibility: (() => void) | null = null;
  const state = { visible: true, watching: 0 };

  const env: QuietEnvironment = {
    now: () => clock,
    setTimeout(task, ms) {
      const handle = nextHandle++;
      timers.set(handle, { at: clock + ms, task });
      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    watchPerformance(onActivity) {
      activity = onActivity;
      state.watching++;
      return () => state.watching--;
    },
    watchInput(onInput) {
      input = onInput;
      state.watching++;
      return () => state.watching--;
    },
    visible: () => state.visible,
    watchVisibility(onChange) {
      visibility = onChange;
      state.watching++;
      return () => state.watching--;
    },
  };

  function advance(ms: number) {
    const target = clock + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (due === undefined) break;
      timers.delete(due[0]);
      clock = Math.max(clock, due[1].at);
      due[1].task();
    }
    clock = target;
  }

  return {
    env,
    advance,
    state,
    network: (endedAt = clock) => activity?.(endedAt),
    touch: () => input?.(),
    show() {
      state.visible = true;
      visibility?.();
    },
    pendingTimers: () => timers.size,
  };
}

const OPTIONS = { quietMs: 3000, maxWaitMs: 15_000 };

describe('whenPageQuiet', () => {
  it('runs the task once nothing has happened for the quiet time', () => {
    const page = fakeEnvironment();
    const task = vi.fn();
    whenPageQuiet(task, OPTIONS, page.env);
    page.advance(2999);
    expect(task).not.toHaveBeenCalled();
    page.advance(1);
    expect(task).toHaveBeenCalledOnce();
    expect(page.state.watching).toBe(0);
  });

  it('starts counting again after a network response or a long task', () => {
    const page = fakeEnvironment();
    const task = vi.fn();
    whenPageQuiet(task, OPTIONS, page.env);
    page.advance(2000);
    page.network();
    page.advance(2999);
    expect(task).not.toHaveBeenCalled();
    page.advance(1);
    expect(task).toHaveBeenCalledOnce();
  });

  it('counts activity that ended before it was asked as having happened then', () => {
    const page = fakeEnvironment();
    page.advance(5000);
    const task = vi.fn();
    whenPageQuiet(task, OPTIONS, page.env);
    page.network(4500); // buffered entries older than the call change nothing
    page.advance(3000);
    expect(task).toHaveBeenCalledOnce();
  });

  it('waits while someone touches or scrolls the page', () => {
    const page = fakeEnvironment();
    const task = vi.fn();
    whenPageQuiet(task, OPTIONS, page.env);
    for (let i = 0; i < 5; i++) {
      page.advance(2000);
      page.touch();
    }
    expect(task).not.toHaveBeenCalled();
    page.advance(3000);
    expect(task).toHaveBeenCalledOnce();
  });

  it('starts anyway when the page never settles', () => {
    const page = fakeEnvironment();
    const task = vi.fn();
    whenPageQuiet(task, OPTIONS, page.env);
    for (let elapsed = 0; elapsed < 14_000; elapsed += 1000) {
      page.advance(1000);
      page.network();
    }
    expect(task).not.toHaveBeenCalled();
    page.advance(1000);
    page.network();
    page.advance(100);
    expect(task).toHaveBeenCalledOnce();
  });

  it('does not run while the page is hidden, and runs when it is visible again', () => {
    const page = fakeEnvironment();
    const task = vi.fn();
    page.state.visible = false;
    whenPageQuiet(task, OPTIONS, page.env);
    page.advance(60_000);
    expect(task).not.toHaveBeenCalled();
    page.show();
    expect(task).toHaveBeenCalledOnce();
    expect(page.state.watching).toBe(0);
  });

  it('does not poll while the page is hidden: it waits for the visibility change', () => {
    const page = fakeEnvironment();
    const task = vi.fn();
    page.state.visible = false;
    whenPageQuiet(task, OPTIONS, page.env);
    page.advance(OPTIONS.quietMs); // quiet now, but hidden
    expect(page.pendingTimers()).toBe(0);
    page.advance(10 * 60_000);
    expect(task).not.toHaveBeenCalled();
    expect(page.pendingTimers()).toBe(0);
    page.show();
    expect(task).toHaveBeenCalledOnce();
  });

  it('keeps waiting for quiet when it is shown while the page is still busy', () => {
    const page = fakeEnvironment();
    const task = vi.fn();
    page.state.visible = false;
    whenPageQuiet(task, OPTIONS, page.env);
    page.advance(1000);
    page.show();
    expect(task).not.toHaveBeenCalled();
    page.advance(2000);
    expect(task).toHaveBeenCalledOnce();
  });

  it('can be cancelled', () => {
    const page = fakeEnvironment();
    const task = vi.fn();
    const cancel = whenPageQuiet(task, OPTIONS, page.env);
    page.advance(1000);
    cancel();
    page.advance(60_000);
    expect(task).not.toHaveBeenCalled();
    expect(page.state.watching).toBe(0);
  });
});
