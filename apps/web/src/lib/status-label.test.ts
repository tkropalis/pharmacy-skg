import type { OpenReason, PharmacyStatus } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n/index.ts';
import { describeStatus, dayAndTime, dutyKindWords, formatDuration } from './status-label.ts';

const el = t('el').app.status;
const en = t('en').app.status;

// 5 Oct 2026 is a Monday; Athens is UTC+3.
const at = new Date('2026-10-05T17:40:00Z'); // 20:40 local
const duty = (kind: 'overnight' | 'day' | 'after-midnight' = 'overnight') =>
  ({ kind: 'duty', duty: kind, date: '2026-10-05', groupId: 'metro', heading: 'H' }) as const;

function open(until: string, reasons: readonly OpenReason[], closingSoon = false): PharmacyStatus {
  return { state: 'open', until: new Date(until), reasons, runReasons: reasons, closingSoon };
}

describe('formatDuration', () => {
  it('writes hours and minutes in Greek', () => {
    expect(formatDuration(80, el)).toBe('1 ώρα 20′');
    expect(formatDuration(120, el)).toBe('2 ώρες');
    expect(formatDuration(125, el)).toBe('2 ώρες 5′');
    expect(formatDuration(45, el)).toBe('45′');
  });
  it('writes hours and minutes in English', () => {
    expect(formatDuration(80, en)).toBe('1 h 20 min');
    expect(formatDuration(120, en)).toBe('2 h');
    expect(formatDuration(45, en)).toBe('45 min');
  });
  it('never shows zero minutes', () => {
    expect(formatDuration(0, en)).toBe('1 min');
  });
});

describe('dayAndTime', () => {
  const day = (iso: string, sameDayWord = false) =>
    dayAndTime(new Date(iso), at, 'el', el, 'Europe/Athens', sameDayWord);
  it('says just the time today, optionally with the word', () => {
    expect(day('2026-10-05T18:00:00Z')).toBe('21:00');
    expect(day('2026-10-05T18:00:00Z', true)).toBe('σήμερα 21:00');
  });
  it('says tomorrow, then the weekday, then the date from a week away', () => {
    expect(day('2026-10-06T05:00:00Z')).toBe('αύριο 08:00');
    expect(day('2026-10-07T05:00:00Z')).toBe('Τετάρτη 08:00');
    expect(dayAndTime(new Date('2026-10-12T05:00:00Z'), at, 'en', en)).toBe('Mon 12 Oct 08:00');
  });
  it('uses the city date, not the UTC one, near midnight', () => {
    // 22:30 UTC on the 5th is 01:30 on the 6th in Athens: "tomorrow".
    expect(day('2026-10-05T22:30:00Z')).toBe('αύριο 01:30');
  });
});

describe('dutyKindWords', () => {
  it('lists distinct duty kinds in words', () => {
    expect(dutyKindWords([duty('overnight'), duty('overnight'), duty('day')], el)).toBe(
      'διανυκτερεύον, διημερεύον',
    );
    expect(dutyKindWords([duty('after-midnight')], en)).toBe('after-midnight duty');
    expect(dutyKindWords([{ kind: 'regular' }], el)).toBeNull();
  });
});

describe('describeStatus', () => {
  it('labels duty with the ΦΣΘ list, the kind and a countdown (Greek)', () => {
    const view = describeStatus({
      status: open('2026-10-05T19:00:00Z', [duty()]),
      at,
      live: true,
      locale: 'el',
      text: el,
    });
    expect(view.kind).toBe('duty');
    expect(view.label).toBe('Εφημερεύει (λίστα ΦΣΘ)');
    expect(view.dutyKinds).toBe('διανυκτερεύον');
    expect(view.timing).toBe('κλείνει σε 1 ώρα 20′ (22:00)');
    expect(view.closingSoon).toBe(false);
  });

  it('labels regular and extended hours (English)', () => {
    const regular = describeStatus({
      status: open('2026-10-05T19:00:00Z', [{ kind: 'regular' }], false),
      at,
      live: true,
      locale: 'en',
      text: en,
    });
    expect(regular.label).toBe('Open (regular hours)');
    expect(regular.timing).toBe('closes in 1 h 20 min (22:00)');
    const extended = describeStatus({
      status: open('2026-10-05T18:00:00Z', [{ kind: 'extended' }]),
      at,
      live: true,
      locale: 'en',
      text: en,
    });
    expect(extended.label).toBe('Open (extended hours)');
    expect(extended.kind).toBe('extended');
  });

  it('puts the day in the closing time for an overnight duty', () => {
    const view = describeStatus({
      status: open('2026-10-06T05:00:00Z', [duty()]),
      at,
      live: true,
      locale: 'en',
      text: en,
    });
    expect(view.timing).toBe('closes in 11 h 20 min (tomorrow 08:00)');
  });

  it('flags closing soon and keeps the countdown in minutes', () => {
    const view = describeStatus({
      status: open('2026-10-05T18:00:00Z', [{ kind: 'regular' }], true),
      at: new Date('2026-10-05T17:35:00Z'),
      live: true,
      locale: 'el',
      text: el,
    });
    expect(view.closingSoon).toBe(true);
    expect(view.timing).toBe('κλείνει σε 25′ (21:00)');
  });

  it('says "open until" for a chosen time and for far-off closings', () => {
    const chosen = describeStatus({
      status: open('2026-10-05T18:00:00Z', [{ kind: 'regular' }]),
      at,
      live: false,
      locale: 'en',
      text: en,
    });
    expect(chosen.timing).toBe('open until 21:00');
    const far = describeStatus({
      status: open('2026-10-06T20:00:00Z', [duty('day')]),
      at,
      live: true,
      locale: 'en',
      text: en,
    });
    expect(far.timing).toMatch(/^open until tomorrow 23:00$/);
  });

  it('labels a duty without printed hours', () => {
    const status: PharmacyStatus = {
      state: 'duty-hours-unknown',
      duty: { date: '2026-10-05', duty: 'on-duty', groupId: 'thermi', heading: 'H' },
      nextOpen: null,
    };
    const view = describeStatus({ status, at, live: true, locale: 'el', text: el });
    expect(view.kind).toBe('duty-unknown');
    expect(view.label).toBe('Εφημερεύει — δεν αναγράφεται ωράριο, καλέστε');
    expect(view.dutyKinds).toBe('εφημερεύον');
    expect(describeStatus({ status, at, live: true, locale: 'en', text: en }).label).toBe(
      'On duty — hours not stated, call first',
    );
  });

  it('says when a closed pharmacy opens', () => {
    const closed = (nextOpen: string | null): PharmacyStatus => ({
      state: 'closed',
      nextOpen: nextOpen === null ? null : new Date(nextOpen),
      nextReasons: [],
      nextRunReasons: [],
    });
    const view = (nextOpen: string | null, locale: 'el' | 'en' = 'el') =>
      describeStatus({
        status: closed(nextOpen),
        at,
        live: true,
        locale,
        text: locale === 'el' ? el : en,
      });
    expect(view('2026-10-06T05:00:00Z')).toMatchObject({
      label: 'Κλειστό',
      timing: 'ανοίγει αύριο 08:00',
      kind: 'closed',
    });
    expect(view('2026-10-05T18:00:00Z').timing).toBe('ανοίγει σήμερα 21:00');
    expect(view('2026-10-07T05:00:00Z', 'en').timing).toBe('opens Wednesday 08:00');
    expect(view(null).timing).toBe('δεν γνωρίζουμε πότε ανοίγει');
  });
});
