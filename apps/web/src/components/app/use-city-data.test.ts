import { describe, expect, it } from 'vitest';
import type { CityData, Meta } from '@pharmacy-skg/core';
import { isDutyLoading } from './use-city-data.ts';
import type { CityState } from './use-city-data.ts';

type Ready = Extract<CityState, { readonly status: 'ready' }>;

function ready(overrides: Partial<Ready>): Ready {
  return {
    status: 'ready',
    data: {} as CityData,
    meta: { duties: { from: '2026-10-01', to: '2026-10-10' } } as Meta,
    failedDates: [],
    pendingDates: [],
    settledDates: [],
    ...overrides,
  };
}

describe('isDutyLoading', () => {
  it('is true for a date being fetched', () => {
    expect(isDutyLoading(ready({ pendingDates: ['2026-10-05'] }), '2026-10-05')).toBe(true);
  });

  it('is true inside the published range for a date not asked for yet', () => {
    expect(isDutyLoading(ready({}), '2026-10-05')).toBe(true);
  });

  it('is false for a date that settled without a file (an unpublished gap, a 404)', () => {
    expect(isDutyLoading(ready({ settledDates: ['2026-10-05'] }), '2026-10-05')).toBe(false);
  });

  it('is false for a date that failed to load', () => {
    const state = ready({ settledDates: ['2026-10-05'], failedDates: ['2026-10-05'] });
    expect(isDutyLoading(state, '2026-10-05')).toBe(false);
  });

  it('is false outside the published range, which is never asked for', () => {
    expect(isDutyLoading(ready({}), '2026-09-30')).toBe(false);
    expect(isDutyLoading(ready({}), '2026-10-11')).toBe(false);
  });

  it('is false when no duty lists are published at all', () => {
    const state = ready({ meta: { duties: null } as Meta });
    expect(isDutyLoading(state, '2026-10-05')).toBe(false);
  });
});
