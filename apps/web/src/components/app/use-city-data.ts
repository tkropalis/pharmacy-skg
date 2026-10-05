import { useCallback, useEffect, useRef, useState } from 'react';
import type { CityData, DutyDay, IsoDate, Meta } from '@pharmacy-skg/core';
import { DEFAULT_CITY_ID } from '../../config.ts';
import { addDays, dateRange, localIsoDate } from '../../lib/dates.ts';
import { loadCityBundle, loadDutyDays } from '../../lib/data.ts';

export type CityState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly data: CityData;
      readonly meta: Meta;
      /** Duty dates that could not be fetched (not merely unpublished). */
      readonly failedDates: readonly IsoDate[];
      /** Duty dates being fetched right now (asked for after the first load). */
      readonly pendingDates: readonly IsoDate[];
    };

/** Yesterday to three days ahead, in the city's time zone: what the first load asks for. */
export function initialDates(now: Date): IsoDate[] {
  const today = localIsoDate(now);
  return dateRange(addDays(today, -1), 5);
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
 * Loads the city's data once, retries on request, refreshes it when the app returns to the
 * foreground, and loads more duty days on demand (a later time picked, the favourites tab).
 */
export function useCityData(): CityDataApi {
  const [state, setState] = useState<CityState>({ status: 'loading' });
  const requested = useRef(new Set<IsoDate>());
  const loadedAt = useRef(0);
  const generation = useRef(0);

  const load = useCallback((silent: boolean) => {
    const run = ++generation.current;
    if (!silent) setState({ status: 'loading' });
    const dates = [...new Set([...initialDates(new Date()), ...requested.current])];
    loadCityBundle(DEFAULT_CITY_ID, dates, { onlyPublishedDates: true })
      .then((bundle) => {
        if (run !== generation.current) return;
        requested.current = new Set(dates.filter((d) => !bundle.failedDates.includes(d)));
        loadedAt.current = Date.now();
        setState({
          status: 'ready',
          data: bundle.data,
          meta: bundle.meta,
          failedDates: bundle.failedDates,
          pendingDates: [],
        });
      })
      .catch(() => {
        if (run !== generation.current) return;
        // A silent refresh that fails keeps what is on screen.
        setState((previous) =>
          silent && previous.status === 'ready' ? previous : { status: 'error' },
        );
      });
  }, []);

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
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const metaRef = useRef<Meta | null>(null);
  metaRef.current = state.status === 'ready' ? state.meta : null;

  const ensureDates = useCallback((dates: readonly IsoDate[]) => {
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
        failedDates: [...previous.failedDates.filter((d) => !missing.includes(d)), ...failedDates],
        pendingDates: previous.pendingDates.filter((d) => !missing.includes(d)),
      };
    };
    setState((previous) =>
      previous.status === 'ready'
        ? { ...previous, pendingDates: [...new Set([...previous.pendingDates, ...missing])] }
        : previous,
    );
    loadDutyDays(DEFAULT_CITY_ID, missing, meta, { onlyPublishedDates: true })
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
  }, []);

  return { state, retry: () => load(false), ensureDates };
}
