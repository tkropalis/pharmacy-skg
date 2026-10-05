import { useCallback, useEffect, useState } from 'react';
import { whenIdle } from '../../lib/idle.ts';
import { whenPageQuiet } from '../../lib/quiet.ts';

/**
 * How long the page must be quiet (no response, no long task, no touch or scroll) before the map
 * starts by itself. Starting MapLibre is several long tasks (the library, the style, shader
 * compilation, the first frames). The first thing a person does is read or scroll the list, and
 * the service worker is still downloading right after the first visit, so the map waits until
 * the page has settled, and does not compete with that. It starts at once when the person
 * reaches for it (see `wake`).
 */
export const MAP_QUIET_MS = 1000;
/** The longest the map waits for a quiet page after the list is ready. */
export const MAP_MAX_WAIT_MS = 15_000;
/** Once quiet, the longest the browser may take to find an idle moment. */
const IDLE_TIMEOUT_MS = 2000;

export interface MapStart {
  /** True once the map should be created. It stays true. */
  readonly started: boolean;
  /** Start the map now: the person touched it, or asked for a pharmacy on it. */
  readonly wake: () => void;
}

/**
 * Decides when the map starts: when the list is ready and the page has settled (and is visible),
 * at the next idle moment, or at once on `wake()`. A page in a background tab never starts it.
 */
export function useMapStart(listReady: boolean): MapStart {
  const [started, setStarted] = useState(false);
  const wake = useCallback(() => setStarted(true), []);

  useEffect(() => {
    if (!listReady || started) return;
    let cancelIdle: (() => void) | undefined;
    const cancelQuiet = whenPageQuiet(
      () => {
        cancelIdle = whenIdle(() => setStarted(true), IDLE_TIMEOUT_MS);
      },
      { quietMs: MAP_QUIET_MS, maxWaitMs: MAP_MAX_WAIT_MS },
    );
    return () => {
      cancelQuiet();
      cancelIdle?.();
    };
  }, [listReady, started]);

  return { started, wake };
}
