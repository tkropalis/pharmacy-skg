import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import type { CityData, DutyDay, IsoDate, Meta } from '@pharmacy-skg/core';
import { onConnectionChange } from '../../lib/connection.ts';
import { addDays, dateRange, localIsoDate } from '../../lib/dates.ts';
import { loadCityBundle, loadDutyDays } from '../../lib/data.ts';
import type { CityBundle } from '../../lib/data.ts';

export type CityState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      /** The city the data is for: for one render after a switch, still the previous one. */
      readonly cityId: string;
      readonly data: CityData;
      readonly meta: Meta;
      /** Duty dates that could not be fetched (not merely unpublished). */
      readonly failedDates: readonly IsoDate[];
      /**
       * Duty dates being fetched right now (asked for after the first load). A date leaves this
       * list once it has settled: loaded, unpublished (404) or failed.
       */
      readonly pendingDates: readonly IsoDate[];
      /**
       * Duty dates whose request has finished, however it ended: loaded, unpublished (404, so
       * simply absent from `data.duties`) or failed. A date that has not been asked for yet is
       * in neither list.
       */
      readonly settledDates: readonly IsoDate[];
    };

/**
 * Whether the duty list for `date` is still on its way: being fetched now, or inside the
 * published range and not asked for yet (the request leaves right after the render that
 * chose the date). A date that settled without a file is an unpublished gap, not "loading".
 */
export function isDutyLoading(
  state: Extract<CityState, { readonly status: 'ready' }>,
  date: IsoDate,
): boolean {
  if (state.pendingDates.includes(date)) return true;
  const range = state.meta.duties;
  if (range === null || date < range.from || date > range.to) return false;
  return !state.settledDates.includes(date);
}

/** Yesterday to three days ahead, in the city's time zone: what the first load asks for. */
export function initialDates(now: Date): IsoDate[] {
  const today = localIsoDate(now);
  return dateRange(addDays(today, -1), 5);
}

let early: { readonly cityId: string; readonly promise: Promise<CityBundle> } | null = null;

/**
 * Starts the first load. The entry script calls this before React is mounted, so the requests
 * leave while React is still being parsed and rendered; the hook picks the result up. A failure
 * is reported the same way as any other (the hook shows the error and offers a retry).
 */
export function prefetchCityData(cityId: string, now: Date = new Date()): void {
  if (early !== null) return;
  const promise = loadCityBundle(cityId, initialDates(now), { onlyPublishedDates: true });
  // The hook awaits it; this keeps an unhandled-rejection report away if it never does.
  promise.catch(() => {});
  early = { cityId, promise };
}

function takeEarlyLoad(cityId: string, dates: readonly IsoDate[]): Promise<CityBundle> | null {
  const taken = early;
  early = null;
  if (taken === null || taken.cityId !== cityId) return null;
  // Only for the dates it was started with (a retry, or dates asked for later, load afresh).
  const initial = initialDates(new Date());
  const same = dates.length === initial.length && dates.every((d, i) => d === initial[i]);
  return same ? taken.promise : null;
}

/** Refresh the data when the app comes back to the foreground after this long. */
const REFRESH_AFTER_MS = 15 * 60_000;

export interface CityDataApi {
  readonly state: CityState;
  readonly retry: () => void;
  /** Loads the duty lists for these dates if they have not been requested yet. */
  readonly ensureDates: (dates: readonly IsoDate[]) => void;
}

/**
 * Loads a city's data once, retries on request, refreshes it when the app returns to the
 * foreground or the connection returns, and loads more duty days on demand (a later time
 * picked, the favourites tab).
 */
export function useCityData(cityId: string): CityDataApi {
  const [state, setState] = useState<CityState>({ status: 'loading' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const requested = useRef(new Set<IsoDate>());
  const loadedAt = useRef(0);
  const generation = useRef(0);

  const load = useCallback(
    (silent: boolean) => {
      const run = ++generation.current;
      if (!silent) setState({ status: 'loading' });
      const dates = [...new Set([...initialDates(new Date()), ...requested.current])];
      const bundlePromise = takeEarlyLoad(cityId, dates);
      (bundlePromise ?? loadCityBundle(cityId, dates, { onlyPublishedDates: true }))
        .then((bundle) => {
          if (run !== generation.current) return;
          requested.current = new Set(dates.filter((d) => !bundle.failedDates.includes(d)));
          loadedAt.current = Date.now();
          // A transition: React renders the list in slices of a few milliseconds, so a long
          // list does not freeze the page in one task.
          startTransition(() =>
            setState({
              status: 'ready',
              cityId,
              data: bundle.data,
              meta: bundle.meta,
              failedDates: bundle.failedDates,
              pendingDates: [],
              settledDates: dates,
            }),
          );
        })
        .catch(() => {
          if (run !== generation.current) return;
          // A silent refresh that fails keeps what is on screen.
          setState((previous) => {
            if (!silent || previous.status !== 'ready') return { status: 'error' };
            if (previous.pendingDates.length === 0) return previous;
            // Duty days asked for meanwhile were dropped with the superseded request. Count them
            // as failed (which offers a retry) so they never stay "loading", and forget them so
            // they are asked for again.
            const lost = previous.pendingDates;
            for (const d of lost) requested.current.delete(d);
            return {
              ...previous,
              failedDates: [...new Set([...previous.failedDates, ...lost])],
              pendingDates: [],
              settledDates: [...new Set([...previous.settledDates, ...lost])],
            };
          });
        });
    },
    [cityId],
  );

  useEffect(() => {
    load(false);
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - loadedAt.current > REFRESH_AFTER_MS
      ) {
        load(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    // Back online: what was shown came from the device (or did not load at all). An error is
    // retried in full; otherwise the list is refreshed behind what is on screen, which also
    // asks again for the days that failed.
    const stopWatching = onConnectionChange((online) => {
      if (online) load(stateRef.current.status === 'ready');
    });
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stopWatching();
    };
  }, [load]);

  const metaRef = useRef<Meta | null>(null);
  metaRef.current = state.status === 'ready' ? state.meta : null;

  const ensureDates = useCallback(
    (dates: readonly IsoDate[]) => {
      const meta = metaRef.current;
      if (meta === null) return;
      const missing = dates.filter((d) => !requested.current.has(d));
      if (missing.length === 0) return;
      for (const d of missing) requested.current.add(d);
      const run = generation.current;
      const settle = (
        previous: CityState,
        duties: ReadonlyMap<IsoDate, DutyDay>,
        failedDates: readonly IsoDate[],
      ): CityState => {
        if (previous.status !== 'ready') return previous;
        const merged = new Map<IsoDate, DutyDay>(previous.data.duties);
        for (const [date, day] of duties) merged.set(date, day);
        return {
          ...previous,
          // A new object: the engine caches its indexes per CityData.
          data: { ...previous.data, duties: merged },
          // A date that was retried and loaded is no longer failed.
          failedDates: [
            ...previous.failedDates.filter((d) => !missing.includes(d)),
            ...failedDates,
          ],
          pendingDates: previous.pendingDates.filter((d) => !missing.includes(d)),
          settledDates: [...new Set([...previous.settledDates, ...missing])],
        };
      };
      setState((previous) =>
        previous.status === 'ready'
          ? { ...previous, pendingDates: [...new Set([...previous.pendingDates, ...missing])] }
          : previous,
      );
      loadDutyDays(cityId, missing, meta, { onlyPublishedDates: true })
        .then(({ duties, failedDates }) => {
          if (run !== generation.current) return;
          for (const d of failedDates) requested.current.delete(d);
          setState((previous) => settle(previous, duties, failedDates));
        })
        .catch(() => {
          if (run !== generation.current) return;
          for (const d of missing) requested.current.delete(d);
          setState((previous) => settle(previous, new Map(), missing));
        });
    },
    [cityId],
  );

  return { state, retry: () => load(false), ensureDates };
}
