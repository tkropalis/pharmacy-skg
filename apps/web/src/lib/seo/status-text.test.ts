import { describe, expect, it } from 'vitest';
import type { PharmacyStatus } from '@pharmacy-skg/core';
import { t } from '../../i18n/index.ts';
import { describeStatus, timeInCity, whenText } from './status-text.ts';

// 2026-10-05 12:00 in Athens (UTC+3 in October).
const now = new Date('2026-10-05T09:00:00Z');

describe('timeInCity', () => {
  it('uses the city time zone whatever the device', () => {
    expect(timeInCity(new Date('2026-10-05T21:30:00Z'), 'el')).toBe('00:30');
    expect(timeInCity(new Date('2026-01-05T21:30:00Z'), 'en')).toBe('23:30');
  });
});

describe('whenText', () => {
  const s = t('el').seo.status;
  it('says today, tomorrow or the weekday', () => {
    expect(whenText(new Date('2026-10-05T14:00:00Z'), now, 'el', s)).toBe('σήμερα στις 17:00');
    expect(whenText(new Date('2026-10-06T05:00:00Z'), now, 'el', s)).toBe('αύριο στις 08:00');
    expect(whenText(new Date('2026-10-08T05:00:00Z'), now, 'en', t('en').seo.status)).toBe(
      'Thursday at 08:00',
    );
  });

  it('compares dates in the city, not in UTC', () => {
    // 22:30 UTC on the 5th is 01:30 on the 6th in Athens.
    expect(whenText(new Date('2026-10-05T22:30:00Z'), now, 'en', t('en').seo.status)).toBe(
      'tomorrow at 01:30',
    );
  });
});

describe('whenText / until across days', () => {
  const en = t('en').seo.status;
  it('names the day when a shift ends tomorrow or later, and the date after a week', () => {
    expect(whenText(new Date('2026-10-14T05:00:00Z'), now, 'en', en)).toBe('Wed 14 Oct at 08:00');
    expect(whenText(new Date('2026-10-11T05:00:00Z'), now, 'en', en)).toBe('Sunday at 08:00');
  });

  it('says "until tomorrow at 08:00" instead of a bare time', () => {
    const status = {
      state: 'open',
      until: new Date('2026-10-06T05:00:00Z'), // 08:00 tomorrow
      closingSoon: false,
      runReasons: [],
      reasons: [{ kind: 'regular' }],
    } as const;
    expect(describeStatus(status, true, now, 'en', t('en')).short).toBe(
      'Open (regular hours) · until tomorrow at 08:00',
    );
    expect(describeStatus(status, true, now, 'el', t('el')).short).toBe(
      'Ανοιχτό (κανονικό ωράριο) · μέχρι αύριο στις 08:00',
    );
  });
});

describe('describeStatus', () => {
  const open = (reasons: PharmacyStatus & { state: 'open' }): PharmacyStatus => reasons;

  it('names the duty listing, the closing time and asks to call', () => {
    const status = open({
      state: 'open',
      until: new Date('2026-10-05T20:00:00Z'),
      closingSoon: false,
      runReasons: [],
      reasons: [
        { kind: 'duty', duty: 'on-duty', date: '2026-10-05', groupId: 'metro', heading: 'x' },
      ],
    });
    const result = describeStatus(status, true, now, 'el', t('el'));
    expect(result.tone).toBe('open');
    expect(result.short).toBe('Εφημερεύει (λίστα ΦΣΘ) · μέχρι τις 23:00');
    expect(result.text).toBe('Εφημερεύει (λίστα ΦΣΘ) · μέχρι τις 23:00. Καλέστε πριν πάτε.');
  });

  it('says regular hours, extended hours and closing soon', () => {
    const base = {
      state: 'open',
      until: new Date('2026-10-05T11:00:00Z'),
      closingSoon: true,
      runReasons: [],
    } as const;
    expect(
      describeStatus({ ...base, reasons: [{ kind: 'regular' }] }, true, now, 'en', t('en')).short,
    ).toBe('Open (regular hours) · until 14:00 (closing soon)');
    expect(
      describeStatus({ ...base, reasons: [{ kind: 'extended' }] }, true, now, 'en', t('en')).short,
    ).toBe('Open (extended hours) · until 14:00 (closing soon)');
  });

  it('warns when the duty list is not published yet', () => {
    const status: PharmacyStatus = {
      state: 'closed',
      nextOpen: null,
      nextReasons: [],
      nextRunReasons: [],
    };
    const result = describeStatus(status, false, now, 'en', t('en'));
    expect(result.tone).toBe('closed');
    expect(result.text).toBe(
      'Closed now. We do not know of an opening in the next 7 days. The duty list for this area and day has not been published yet, so the status may change. Call before you go.',
    );
  });

  it('says when a closed pharmacy opens next', () => {
    const status: PharmacyStatus = {
      state: 'closed',
      nextOpen: new Date('2026-10-05T14:00:00Z'),
      nextReasons: [{ kind: 'regular' }],
      nextRunReasons: [{ kind: 'regular' }],
    };
    expect(describeStatus(status, true, now, 'el', t('el')).text).toBe(
      'Κλειστό τώρα. Ανοίγει σήμερα στις 17:00. Καλέστε πριν πάτε.',
    );
  });

  it('says on duty without hours', () => {
    const status: PharmacyStatus = {
      state: 'duty-hours-unknown',
      duty: { date: '2026-10-05', duty: 'on-duty', groupId: 'thermi', heading: 'x' },
      nextOpen: null,
    };
    const result = describeStatus(status, true, now, 'el', t('el'));
    expect(result.tone).toBe('duty-unknown');
    // The same words as the home screen's label.
    expect(result.short).toBe(t('el').status.dutyUnknown);
    expect(result.short).toBe(t('el').app.status.dutyUnknown);
    expect(result.text).toContain('Καλέστε πριν πάτε');
  });
});
