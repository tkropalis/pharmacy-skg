import { describe, expect, it } from 'vitest';
import type { Meta } from '@pharmacy-skg/core';
import {
  isExtendedHoursPath,
  isPublishedPath,
  selectDutyFiles,
  withPublishedDates,
} from './data-files.ts';

const names = [
  '2026-09-27.json',
  '2026-09-28.json',
  '2026-10-05.json',
  '2026-10-08.json',
  '2026-10-09.json',
  'notes.txt',
  '2026-10-05.json.bak',
  '.DS_Store',
];

describe('selectDutyFiles', () => {
  it('keeps dates from today minus 7 days onward', () => {
    expect(selectDutyFiles(names, '2026-10-05')).toEqual([
      '2026-09-28.json',
      '2026-10-05.json',
      '2026-10-08.json',
      '2026-10-09.json',
    ]);
  });

  it('includes the boundary day and excludes the day before it', () => {
    expect(selectDutyFiles(names, '2026-10-05')).toContain('2026-09-28.json');
    expect(selectDutyFiles(names, '2026-10-05')).not.toContain('2026-09-27.json');
  });

  it('crosses a month and year boundary', () => {
    const list = ['2026-12-24.json', '2026-12-25.json', '2027-01-01.json'];
    expect(selectDutyFiles(list, '2027-01-01')).toEqual(list.slice(1));
  });
});

describe('isExtendedHoursPath / isPublishedPath', () => {
  it('accepts the files the app reads', () => {
    expect(isExtendedHoursPath('extended-hours/2026-09-01_2026-10-31.json')).toBe(true);
    expect(isPublishedPath('meta.json')).toBe(true);
    expect(isPublishedPath('pharmacies.json')).toBe(true);
    expect(isPublishedPath('duties/2026-10-05.json')).toBe(true);
    expect(isPublishedPath('extended-hours/2026-09-01_2026-10-31.json')).toBe(true);
  });

  it('rejects pipeline internals and path tricks', () => {
    for (const path of [
      'overrides.json',
      'inputs/geocode-cache.json',
      'duties/../overrides.json',
      'duties/notes.json',
      'extended-hours/../overrides.json',
      'extended-hours/sub/x.json',
      '../thessaloniki/meta.json',
      '',
    ]) {
      expect(isPublishedPath(path), path).toBe(false);
    }
  });
});

describe('withPublishedDates', () => {
  const meta = {
    schemaVersion: 1,
    city: 'thessaloniki',
    updatedAt: '2026-10-24T08:00:00.000Z',
    duties: { from: '2026-06-04', to: '2026-10-29' },
    extendedHours: [],
    sources: [],
  } satisfies Meta;

  it('lists the dates of the published duty files, gaps left out', () => {
    const files = ['2026-10-25.json', '2026-10-08.json', '2026-10-24.json', '2026-10-27.json'];
    expect(withPublishedDates(meta, files).duties?.dates).toEqual([
      '2026-10-08',
      '2026-10-24',
      '2026-10-25',
      '2026-10-27',
    ]);
  });

  it('leaves a city without duties alone', () => {
    const none = { ...meta, duties: null };
    expect(withPublishedDates(none, ['2026-10-24.json'])).toBe(none);
  });
});
