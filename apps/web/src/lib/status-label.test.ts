import type { OpenReason, PharmacyStatus } from '@pharmacy-skg/core';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n/index.ts';
import { describeStatus, dayAndTime, formatDuration } from './status-label.ts';

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
  it('writes hours and minutes in Greek words', () => {
    expect(formatDuration(80, el)).toBe('1 ώρα 20 λεπτά');
    expect(formatDuration(120, el)).toBe('2 ώρες');
    expect(formatDuration(125, el)).toBe('2 ώρες 5 λεπτά');
    expect(formatDuration(45, el)).toBe('45 λεπτά');
    expect(formatDuration(1, el)).toBe('1 λεπτό');
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

describe('describeStatus', () => {
  it('says on duty and until when, in one short sentence (Greek)', () => {
    const view = describeStatus({
      status: open('2026-10-05T19:00:00Z', [duty()]),
      at,
      live: true,
      locale: 'el',
      text: el,
    });
    expect(view.kind).toBe('duty');
    expect(view.label).toBe('Εφημερεύει έως 22:00');
    expect(view.closingSoon).toBe(false);
  });

  it('says just "Open" for regular and extended hours (English)', () => {
    const regular = describeStatus({
      status: open('2026-10-05T19:00:00Z', [{ kind: 'regular' }], false),
      at,
      live: true,
      locale: 'en',
      text: en,
    });
    expect(regular.label).toBe('Open until 22:00');
    const extended = describeStatus({
      status: open('2026-10-05T18:00:00Z', [{ kind: 'extended' }]),
      at,
      live: true,
      locale: 'en',
      text: en,
    });
    expect(extended.label).toBe('Open until 21:00');
    expect(extended.short.label).toBe('Open');
    // And the same marker (the owner, 6 Oct 2026).
    expect(extended.kind).toBe('open');
    expect(regular.kind).toBe('open');
  });

  it('says all night, with the day, for an all-night duty', () => {
    const view = (locale: 'el' | 'en') =>
      describeStatus({
        status: open('2026-10-06T05:00:00Z', [duty('after-midnight')]),
        at,
        live: true,
        locale,
        text: locale === 'el' ? el : en,
      });
    expect(view('el').label).toBe('Εφημερεύει όλη τη νύχτα έως αύριο 08:00');
    expect(view('en').label).toBe('On duty all night until tomorrow 08:00');
    expect(view('el').short).toEqual({ label: 'Εφημερεύει', timing: 'έως αύριο 08:00' });
  });

  it('counts down only when closing soon', () => {
    const view = describeStatus({
      status: open('2026-10-05T18:00:00Z', [{ kind: 'regular' }], true),
      at: new Date('2026-10-05T17:35:00Z'),
      live: true,
      locale: 'el',
      text: el,
    });
    expect(view.closingSoon).toBe(true);
    expect(view.short).toEqual({ label: 'Ανοιχτό', timing: 'κλείνει σε 25 λεπτά' });
    expect(view.label).toBe('Ανοιχτό έως 21:00, κλείνει σε 25 λεπτά');
  });

  it('says "until midnight" rather than "tomorrow 00:00"', () => {
    const view = (locale: 'el' | 'en', live = true) =>
      describeStatus({
        status: open('2026-10-05T21:00:00Z', [duty()]), // 00:00 on the 6th in Athens
        at,
        live,
        locale,
        text: locale === 'el' ? el : en,
      });
    expect(view('el').label).toBe('Εφημερεύει έως τα μεσάνυχτα');
    expect(view('el').short).toEqual({ label: 'Εφημερεύει', timing: 'έως τα μεσάνυχτα' });
    expect(view('en').label).toBe('On duty until midnight');
    expect(view('en', false).short.timing).toBe('until midnight');
  });

  it('counts down to midnight in the same words', () => {
    const view = describeStatus({
      status: open('2026-10-05T21:00:00Z', [duty()], true),
      at: new Date('2026-10-05T20:40:00Z'), // 23:40 local
      live: true,
      locale: 'el',
      text: el,
    });
    expect(view.label).toBe('Εφημερεύει έως τα μεσάνυχτα, κλείνει σε 20 λεπτά');
    expect(view.short.timing).toBe('κλείνει σε 20 λεπτά');
  });

  it('says "until" for a chosen time, even when closing soon', () => {
    const chosen = describeStatus({
      status: open('2026-10-05T18:00:00Z', [{ kind: 'regular' }], true),
      at,
      live: false,
      locale: 'en',
      text: en,
    });
    expect(chosen.label).toBe('Open until 21:00');
    expect(chosen.short.timing).toBe('until 21:00');
  });

  it('labels a duty without printed hours', () => {
    const status: PharmacyStatus = {
      state: 'duty-hours-unknown',
      duty: { date: '2026-10-05', duty: 'on-duty', groupId: 'thermi', heading: 'H' },
      nextOpen: null,
    };
    const view = describeStatus({ status, at, live: true, locale: 'el', text: el });
    expect(view.kind).toBe('duty-unknown');
    expect(view.label).toBe('Εφημερεύει, καλέστε για το ωράριο');
    expect(view.short).toEqual({ label: 'Εφημερεύει', timing: 'καλέστε για το ωράριο' });
    expect(describeStatus({ status, at, live: true, locale: 'en', text: en }).label).toBe(
      'On duty, call for the hours',
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
      label: 'Κλειστό, ανοίγει αύριο 08:00',
      short: { label: 'Κλειστό', timing: 'ανοίγει αύριο 08:00' },
      kind: 'closed',
    });
    expect(view('2026-10-05T18:00:00Z').label).toBe('Κλειστό, ανοίγει σήμερα 21:00');
    expect(view('2026-10-07T05:00:00Z', 'en').label).toBe('Closed, opens Wednesday 08:00');
    expect(view(null).label).toBe('Κλειστό, δεν ξέρουμε πότε ανοίγει');
  });
});

describe('the short form, for the list', () => {
  it('is a word and the closing time', () => {
    const view = describeStatus({
      status: open('2026-10-05T11:30:00Z', [{ kind: 'regular' }]),
      at: new Date('2026-10-05T06:49:00Z'),
      live: true,
      locale: 'el',
      text: el,
    });
    expect(view.short).toEqual({ label: 'Ανοιχτό', timing: 'έως 14:30' });
    expect(view.label).toBe('Ανοιχτό έως 14:30');
  });
});
