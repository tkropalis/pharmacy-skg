import { describe, expect, it } from 'vitest';
import { t } from '../../i18n/index.ts';
import {
  extraHoursText,
  fill,
  formatDate,
  formatLongDate,
  formatShortDate,
  regularHoursView,
  windowText,
} from './format.ts';

describe('regularHoursView', () => {
  it('words the Greek hours with weekdays that share hours grouped', () => {
    const view = regularHoursView('thessaloniki', '2026-10-05', t('el').seo);
    expect(view.text).toBe(
      'Συνηθισμένο ωράριο: Δευ/Τετ 08:00–14:30 · Τρί/Πέμ/Παρ 08:00–14:00, 17:00–21:00',
    );
    expect(view.closedDays).toBe('Σάβ/Κυρ');
    expect(view.groups).toEqual([
      { days: 'Δευ/Τετ', times: '08:00–14:30' },
      { days: 'Τρί/Πέμ/Παρ', times: '08:00–14:00, 17:00–21:00' },
    ]);
  });

  it('words the English hours the same way', () => {
    const view = regularHoursView('thessaloniki', '2026-10-05', t('en').seo);
    expect(view.text).toBe(
      'Usual hours: Mon/Wed 08:00–14:30 · Tue/Thu/Fri 08:00–14:00, 17:00–21:00',
    );
    expect(view.closedDays).toBe('Sat/Sun');
  });

  it('does not depend on the weekday the week starts on', () => {
    const monday = regularHoursView('thessaloniki', '2026-10-05', t('el').seo);
    const thursday = regularHoursView('thessaloniki', '2026-10-08', t('el').seo);
    expect(thursday).toEqual(monday);
  });

  it('has no hours for a city without a table', () => {
    const view = regularHoursView('nowhere', '2026-10-05', t('el').seo);
    expect(view.groups).toEqual([]);
    expect(view.closedDays).toBe('Δευ/Τρί/Τετ/Πέμ/Παρ/Σάβ/Κυρ');
  });
});

describe('duty hours wording', () => {
  const el = t('el').seo;
  const en = t('en').seo;

  it('prints the heading hours, or says there are none', () => {
    expect(windowText({ from: '08:00', to: '23:00', toNextDay: false }, el)).toBe('08:00–23:00');
    expect(windowText({ from: '20:00', to: '08:00', toNextDay: true }, en)).toBe(
      '20:00–08:00 (until the next day)',
    );
    expect(windowText(null, el)).toBe('η λίστα δεν γράφει ώρες, καλέστε');
  });

  it('prints extra hours with their weekdays', () => {
    const extra = { weekdays: [5, 2, 4], from: '14:00', to: '17:00', exceptHolidays: true };
    expect(extraHoursText(extra, el)).toBe('Τρί/Πέμ/Παρ 14:00–17:00 (εκτός αργιών)');
    expect(extraHoursText({ ...extra, exceptHolidays: false }, en)).toBe('Tue/Thu/Fri 14:00–17:00');
  });
});

describe('dates', () => {
  it('formats calendar dates without a time zone', () => {
    expect(formatLongDate('2026-10-05', 'el')).toBe('Δευτέρα 5 Οκτωβρίου 2026');
    expect(formatLongDate('2026-10-05', 'en')).toBe('Monday 5 October 2026');
    expect(formatDate('2026-09-01', 'el')).toBe('1 Σεπτεμβρίου 2026');
    expect(formatShortDate('2026-10-05', 'en')).toBe('Mon 5 Oct');
  });
});

describe('fill', () => {
  it('replaces placeholders and leaves unknown ones', () => {
    expect(fill('{a} and {b} and {c}', { a: 1, b: 'two' })).toBe('1 and two and {c}');
  });
});
