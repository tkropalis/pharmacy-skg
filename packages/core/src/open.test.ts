import { describe, expect, it } from 'vitest';
import { THESSALONIKI } from './city.ts';
import type {
  DutyDay,
  DutyKind,
  DutySection,
  ExtendedHours,
  ExtendedHoursEntry,
  ExtraHours,
  Pharmacy,
  Schedule,
  TimeRange,
  TimeWindow,
} from './data.ts';
import {
  distanceMetres,
  openIntervals,
  openPharmacies,
  pharmacyStatus,
  publishedDuties,
} from './open.ts';
import type { CityData, OpenInterval, PharmacyStatus } from './open.ts';
import { localToInstant, zonedParts } from './zoned.ts';

// --- Fixture builders --------------------------------------------------------

const ATHENS = 'Europe/Athens';

/** The instant at Athens wall-clock `date time`. */
const at = (date: string, time: string) => localToInstant(date, time, ATHENS);

/** An instant as Athens wall-clock "YYYY-MM-DD HH:MM", to keep assertions readable. */
function local(instant: Date | null): string | null {
  if (!instant) return null;
  const { date, minutes } = zonedParts(instant, ATHENS);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

function spans(intervals: readonly OpenInterval[]): [string | null, string | null][] {
  return intervals.map((i) => [local(i.start), local(i.end)]);
}

function pharmacy(id: string, extra: Partial<Pharmacy> = {}): Pharmacy {
  return {
    id,
    name: `Pharmacy ${id}`,
    address: 'Somewhere 1',
    locality: 'Θεσσαλονίκη',
    postcode: null,
    phone: id,
    groupId: 'metro',
    location: null,
    sources: ['fsth'],
    firstSeen: '2026-06-01',
    lastSeen: '2026-10-01',
    ...extra,
  };
}

const win = (from: string, to: string, toNextDay = to <= from): TimeWindow => ({
  from,
  to,
  toNextDay,
});

function section(
  kind: DutyKind,
  hours: TimeWindow | null,
  ids: string[],
  options: { heading?: string; extraHours?: ExtraHours[] } = {},
): DutySection {
  return {
    kind,
    heading: options.heading ?? `${kind} heading`,
    hours,
    extraHours: options.extraHours ?? [],
    notes: [],
    entries: ids.map((id) => ({ pharmacyId: id, name: id, address: '', locality: '', phone: id })),
  };
}

/** A duty day: sections per group id. */
function day(date: string, groups: Record<string, DutySection[]>): DutyDay {
  return {
    schemaVersion: 1,
    date,
    groups: Object.entries(groups).map(([id, sections]) => ({
      id,
      name: id,
      source: { url: 'https://example.invalid', uploadedAt: '2026-10-04T00:00:00Z' },
      sections,
    })),
  };
}

function extended(period: [string, string], entries: [string, Schedule][]): ExtendedHours {
  return {
    schemaVersion: 1,
    period: { from: period[0], to: period[1] },
    title: 'test',
    announcementUrl: '',
    source: { url: '', uploadedAt: '' },
    entries: entries.map(([pharmacyId, schedule]): ExtendedHoursEntry => ({
      pharmacyId,
      name: pharmacyId,
      address: '',
      postcode: '',
      area: '',
      schedule,
      scheduleText: '',
    })),
  };
}

const weekly = (days: Record<string, TimeRange[]>): Schedule => ({ type: 'weekly', days });
const dated = (dates: Record<string, TimeRange[]>): Schedule => ({ type: 'dates', dates });
const range = (from: string, to: string): TimeRange => ({ from, to });

function city(
  pharmacies: Pharmacy[],
  duties: DutyDay[] = [],
  extendedHours: ExtendedHours[] = [],
): CityData {
  return {
    city: THESSALONIKI,
    pharmacies,
    duties: new Map(duties.map((d) => [d.date, d])),
    extendedHours,
  };
}

const status = (data: CityData, id: string, when: Date): PharmacyStatus =>
  pharmacyStatus(data, id, when).status;

/** Compact view of a status for table assertions. */
function describeStatus(s: PharmacyStatus): string {
  switch (s.state) {
    case 'open':
      return `open until ${local(s.until)}`;
    case 'duty-hours-unknown':
      return `duty-hours-unknown, next ${local(s.nextOpen)}`;
    case 'closed':
      return `closed, next ${local(s.nextOpen)}`;
  }
}

// 2026-10-05 is a Monday.
const MONDAY = '2026-10-05';
const TUESDAY = '2026-10-06';

// --- Regular hours -----------------------------------------------------------

describe('regular hours', () => {
  const data = city([pharmacy('a')]);
  const cases: [string, string, string, string][] = [
    ['Monday 14:29 is open', MONDAY, '14:29', 'open until 2026-10-05 14:30'],
    [
      'Monday 14:30 is closed; opens Tuesday 08:00',
      MONDAY,
      '14:30',
      'closed, next 2026-10-06 08:00',
    ],
    ['Monday 08:00 opens', MONDAY, '08:00', 'open until 2026-10-05 14:30'],
    ['Monday 07:59 is closed', MONDAY, '07:59', 'closed, next 2026-10-05 08:00'],
    ['Monday 17:00 stays closed (no afternoon)', MONDAY, '17:00', 'closed, next 2026-10-06 08:00'],
    ['Tuesday 13:59 is open', TUESDAY, '13:59', 'open until 2026-10-06 14:00'],
    ['Tuesday 14:00 closes for the break', TUESDAY, '14:00', 'closed, next 2026-10-06 17:00'],
    ['Tuesday 17:00 reopens', TUESDAY, '17:00', 'open until 2026-10-06 21:00'],
    ['Tuesday 21:00 closes', TUESDAY, '21:00', 'closed, next 2026-10-07 08:00'],
    ['Wednesday 14:29 is open', '2026-10-07', '14:29', 'open until 2026-10-07 14:30'],
    ['Thursday 18:00 is open', '2026-10-08', '18:00', 'open until 2026-10-08 21:00'],
    ['Friday 20:59 is open', '2026-10-09', '20:59', 'open until 2026-10-09 21:00'],
    ['Friday 21:00 is closed until Monday', '2026-10-09', '21:00', 'closed, next 2026-10-12 08:00'],
    [
      'Saturday noon is closed until Monday',
      '2026-10-10',
      '12:00',
      'closed, next 2026-10-12 08:00',
    ],
    ['Sunday noon is closed until Monday', '2026-10-11', '12:00', 'closed, next 2026-10-12 08:00'],
  ];
  it.each(cases)('%s', (_name, date, time, expected) => {
    expect(describeStatus(status(data, 'a', at(date, time)))).toBe(expected);
  });

  it('reports the regular reason', () => {
    const s = status(data, 'a', at(MONDAY, '10:00'));
    expect(s.state === 'open' && s.reasons).toEqual([{ kind: 'regular' }]);
    const closed = status(data, 'a', at(MONDAY, '15:00'));
    expect(closed.state === 'closed' && closed.nextReasons).toEqual([{ kind: 'regular' }]);
  });

  it('flags closingSoon within 30 minutes of closing, not before', () => {
    const closingSoon = (time: string) => {
      const s = status(data, 'a', at(MONDAY, time));
      return s.state === 'open' ? s.closingSoon : null;
    };
    expect(closingSoon('14:29')).toBe(true);
    expect(closingSoon('14:00')).toBe(true); // exactly 30 minutes left
    expect(closingSoon('13:59')).toBe(false); // 31 minutes left
    expect(closingSoon('09:00')).toBe(false);
  });

  it('does not use the device time zone: the same instant, read in Athens', () => {
    // 11:29Z is 14:29 in Athens (UTC+3), whatever zone the test runs in.
    expect(describeStatus(status(data, 'a', new Date('2026-10-05T11:29:00Z')))).toBe(
      'open until 2026-10-05 14:30',
    );
  });

  it('uses winter time after the clock change', () => {
    // Monday 2026-10-26 is a metro holiday; use the next Monday, 2026-11-02 (UTC+2).
    expect(describeStatus(status(data, 'a', new Date('2026-11-02T12:29:00Z')))).toBe(
      'open until 2026-11-02 14:30',
    );
  });
});

// --- Intervals ---------------------------------------------------------------

describe('openIntervals', () => {
  const data = city([pharmacy('a')]);

  it('returns merged intervals for a whole week', () => {
    expect(spans(openIntervals(data, 'a', at(MONDAY, '00:00'), at('2026-10-12', '00:00')))).toEqual(
      [
        ['2026-10-05 08:00', '2026-10-05 14:30'],
        ['2026-10-06 08:00', '2026-10-06 14:00'],
        ['2026-10-06 17:00', '2026-10-06 21:00'],
        ['2026-10-07 08:00', '2026-10-07 14:30'],
        ['2026-10-08 08:00', '2026-10-08 14:00'],
        ['2026-10-08 17:00', '2026-10-08 21:00'],
        ['2026-10-09 08:00', '2026-10-09 14:00'],
        ['2026-10-09 17:00', '2026-10-09 21:00'],
      ],
    );
  });

  it('clips to [from, to)', () => {
    expect(spans(openIntervals(data, 'a', at(MONDAY, '10:00'), at(MONDAY, '12:00')))).toEqual([
      ['2026-10-05 10:00', '2026-10-05 12:00'],
    ]);
    // `to` is exclusive: an interval starting exactly at `to` is excluded.
    expect(openIntervals(data, 'a', at(MONDAY, '06:00'), at(MONDAY, '08:00'))).toEqual([]);
    // `from` is inclusive of an interval's last instant but not of its end.
    expect(openIntervals(data, 'a', at(MONDAY, '14:30'), at(MONDAY, '16:00'))).toEqual([]);
  });

  it('returns nothing for an empty or inverted range, or an unknown pharmacy', () => {
    expect(openIntervals(data, 'a', at(MONDAY, '10:00'), at(MONDAY, '10:00'))).toEqual([]);
    expect(openIntervals(data, 'a', at(MONDAY, '12:00'), at(MONDAY, '10:00'))).toEqual([]);
    expect(openIntervals(data, 'nobody', at(MONDAY, '00:00'), at(TUESDAY, '00:00'))).toEqual([]);
  });

  it('answers closed with no next opening for an unknown pharmacy', () => {
    expect(pharmacyStatus(data, 'nobody', at(MONDAY, '10:00')).status).toEqual({
      state: 'closed',
      nextOpen: null,
      nextReasons: [],
    });
  });
});

// --- Duties ------------------------------------------------------------------

const overnightHeading = 'Διανυκτερεύοντα Φαρμακεία (από 21:00 έως 00:00)';
const afterMidnightHeading = 'Μεταμεσονύκτια Φαρμακεία (από 21:00 έως 08:00 το επόμενο πρωί)';
const midday: ExtraHours = {
  weekdays: [2, 4, 5],
  from: '14:00',
  to: '17:00',
  exceptHolidays: true,
};

describe('duties', () => {
  it('merges a Tuesday overnight duty with its midday extra hours and regular hours', () => {
    const data = city(
      [pharmacy('a')],
      [
        day(TUESDAY, {
          metro: [
            section('overnight', win('21:00', '00:00'), ['a'], {
              heading: overnightHeading,
              extraHours: [midday],
            }),
          ],
        }),
      ],
    );
    const intervals = openIntervals(data, 'a', at(TUESDAY, '00:00'), at('2026-10-07', '00:00'));
    expect(spans(intervals)).toEqual([['2026-10-06 08:00', '2026-10-07 00:00']]);
    expect(intervals[0]?.reasons).toEqual([
      { kind: 'regular' },
      { kind: 'duty-extra', duty: 'overnight', date: TUESDAY, groupId: 'metro' },
      {
        kind: 'duty',
        duty: 'overnight',
        date: TUESDAY,
        groupId: 'metro',
        heading: overnightHeading,
      },
    ]);

    // One continuous opening: 15:00 is open until midnight, and so is 22:00.
    expect(describeStatus(status(data, 'a', at(TUESDAY, '15:00')))).toBe(
      'open until 2026-10-07 00:00',
    );
    expect(describeStatus(status(data, 'a', at(TUESDAY, '22:00')))).toBe(
      'open until 2026-10-07 00:00',
    );
    expect(describeStatus(status(data, 'a', at('2026-10-07', '00:00')))).toBe(
      'closed, next 2026-10-07 08:00',
    );
  });

  it('does not apply the midday extra hours on a Monday', () => {
    const data = city(
      [pharmacy('a')],
      [
        day(MONDAY, {
          metro: [
            section('overnight', win('21:00', '00:00'), ['a'], {
              heading: overnightHeading,
              extraHours: [midday],
            }),
          ],
        }),
      ],
    );
    expect(spans(openIntervals(data, 'a', at(MONDAY, '00:00'), at(TUESDAY, '00:00')))).toEqual([
      ['2026-10-05 08:00', '2026-10-05 14:30'],
      ['2026-10-05 21:00', '2026-10-06 00:00'],
    ]);
  });

  it('keeps an after-midnight duty open on the next date, and dates the reason by its list', () => {
    const data = city(
      [pharmacy('a')],
      [
        day(MONDAY, {
          metro: [
            section('after-midnight', win('21:00', '08:00'), ['a'], {
              heading: afterMidnightHeading,
            }),
          ],
        }),
        day(TUESDAY, { metro: [] }),
      ],
    );
    const s = status(data, 'a', at(TUESDAY, '03:00'));
    expect(s.state).toBe('open');
    if (s.state !== 'open') return;
    // The duty runs to 08:00 and touches Tuesday's regular opening, so the interval continues.
    expect(local(s.until)).toBe('2026-10-06 14:00');
    expect(s.closingSoon).toBe(false);
    expect(s.reasons).toEqual([
      {
        kind: 'duty',
        duty: 'after-midnight',
        date: MONDAY,
        groupId: 'metro',
        heading: afterMidnightHeading,
      },
      { kind: 'regular' },
    ]);
    expect(pharmacyStatus(data, 'a', at(TUESDAY, '03:00')).dutiesPublished).toBe(true);
  });

  it('closes an after-midnight duty at its end when nothing else is open', () => {
    // Saturday night into Sunday: no regular hours on Sunday.
    const data = city(
      [pharmacy('a')],
      [
        day('2026-10-10', {
          metro: [section('after-midnight', win('21:00', '08:00'), ['a'])],
        }),
      ],
    );
    expect(describeStatus(status(data, 'a', at('2026-10-11', '07:59')))).toBe(
      'open until 2026-10-11 08:00',
    );
    expect(describeStatus(status(data, 'a', at('2026-10-11', '08:00')))).toBe(
      'closed, next 2026-10-12 08:00',
    );
    // 29 minutes before it ends it is closing soon.
    const soon = status(data, 'a', at('2026-10-11', '07:31'));
    expect(soon.state === 'open' && soon.closingSoon).toBe(true);
  });

  it('keeps a window ending 24:00 (stored as 00:00 next day) open until midnight', () => {
    const data = city(
      [pharmacy('a', { groupId: 'lagkadas' })],
      [day('2026-10-10', { lagkadas: [section('on-duty', win('08:00', '00:00'), ['a'])] })],
    );
    expect(describeStatus(status(data, 'a', at('2026-10-10', '23:59')))).toBe(
      'open until 2026-10-11 00:00',
    );
  });

  it('opens a Saturday-extra and a day duty with their own hours', () => {
    const data = city(
      [pharmacy('a'), pharmacy('b')],
      [
        day('2026-10-10', {
          metro: [
            section('saturday-extra', win('08:30', '14:30'), ['a']),
            section('day', win('08:00', '21:00'), ['b']),
          ],
        }),
      ],
    );
    const sat = (time: string) => [
      describeStatus(status(data, 'a', at('2026-10-10', time))),
      describeStatus(status(data, 'b', at('2026-10-10', time))),
    ];
    expect(sat('08:15')).toEqual(['closed, next 2026-10-10 08:30', 'open until 2026-10-10 21:00']);
    expect(sat('14:30')).toEqual(['closed, next 2026-10-12 08:00', 'open until 2026-10-10 21:00']);
  });

  it('unions the reasons of a pharmacy listed in two overlapping sections, once each', () => {
    const data = city(
      [pharmacy('a', { groupId: 'thermaikos' })],
      [
        day('2026-10-10', {
          thermaikos: [
            section('day', win('08:00', '21:00'), ['a']),
            section('on-duty', win('08:00', '00:00'), ['a']),
          ],
        }),
      ],
    );
    const [only] = openIntervals(data, 'a', at('2026-10-10', '00:00'), at('2026-10-11', '00:00'));
    expect(only && local(only.end)).toBe('2026-10-11 00:00');
    expect(only?.reasons.map((r) => r.kind === 'duty' && r.duty)).toEqual(['day', 'on-duty']);
  });

  it('measures a night across the October clock change in real time', () => {
    // Saturday 2026-10-24 21:00 to Sunday 08:00, over the repeated hour.
    const data = city(
      [pharmacy('a')],
      [day('2026-10-24', { metro: [section('after-midnight', win('21:00', '08:00'), ['a'])] })],
    );
    const [night] = openIntervals(data, 'a', at('2026-10-24', '12:00'), at('2026-10-26', '00:00'));
    expect(night?.start.toISOString()).toBe('2026-10-24T18:00:00.000Z');
    expect(night?.end.toISOString()).toBe('2026-10-25T06:00:00.000Z');
  });

  it('measures a night across the March clock change in real time', () => {
    const data = city(
      [pharmacy('a')],
      [day('2027-03-27', { metro: [section('after-midnight', win('21:00', '08:00'), ['a'])] })],
    );
    const [night] = openIntervals(data, 'a', at('2027-03-27', '12:00'), at('2027-03-29', '00:00'));
    expect(night?.start.toISOString()).toBe('2027-03-27T19:00:00.000Z');
    expect(night?.end.toISOString()).toBe('2027-03-28T05:00:00.000Z');
  });

  it('reports a duty without hours as duty-hours-unknown, then closed', () => {
    const data = city(
      [pharmacy('t', { groupId: 'thermi' })],
      [
        day('2026-10-10', {
          thermi: [section('on-duty', null, ['t'], { heading: 'Εφημερεύοντα Φαρμακεία' })],
        }),
      ],
    );
    const unknown = status(data, 't', at('2026-10-10', '12:00'));
    expect(unknown).toEqual({
      state: 'duty-hours-unknown',
      duty: {
        date: '2026-10-10',
        duty: 'on-duty',
        groupId: 'thermi',
        heading: 'Εφημερεύοντα Φαρμακεία',
      },
      nextOpen: at('2026-10-12', '08:00'),
    });
    // The duty day runs from 08:00 to 08:00, so 03:00 on the 11th still belongs to it.
    expect(status(data, 't', at('2026-10-11', '07:59')).state).toBe('duty-hours-unknown');
    expect(status(data, 't', at('2026-10-11', '08:00')).state).toBe('closed');
    // Before 08:00 on the listed day the duty has not begun.
    expect(status(data, 't', at('2026-10-10', '07:59')).state).toBe('closed');
  });

  it('prefers open over duty-hours-unknown when regular hours apply', () => {
    const data = city(
      [pharmacy('t', { groupId: 'thermi' })],
      [day(MONDAY, { thermi: [section('on-duty', null, ['t'])] })],
    );
    expect(status(data, 't', at(MONDAY, '10:00')).state).toBe('open');
    expect(status(data, 't', at(MONDAY, '15:00')).state).toBe('duty-hours-unknown');
  });

  it('gives no interval for a section without hours', () => {
    const data = city(
      [pharmacy('t', { groupId: 'thermi' })],
      [day('2026-10-10', { thermi: [section('overnight', null, ['t'])] })],
    );
    expect(openIntervals(data, 't', at('2026-10-10', '00:00'), at('2026-10-12', '00:00'))).toEqual(
      [],
    );
  });

  it('lists published duties on or after a date, in date order', () => {
    const data = city(
      [pharmacy('a'), pharmacy('b')],
      [
        day('2026-10-07', { metro: [section('overnight', win('21:00', '00:00'), ['a'])] }),
        day('2026-10-05', {
          metro: [
            section('day', win('08:00', '21:00'), ['a', 'b']),
            section('after-midnight', win('21:00', '08:00'), ['a']),
          ],
        }),
        day('2026-10-06', { thermi: [section('on-duty', null, ['b'])] }),
      ],
    );
    expect(publishedDuties(data, 'a', '2026-10-05').map((d) => [d.date, d.duty])).toEqual([
      ['2026-10-05', 'day'],
      ['2026-10-05', 'after-midnight'],
      ['2026-10-07', 'overnight'],
    ]);
    expect(publishedDuties(data, 'a', '2026-10-06').map((d) => d.date)).toEqual(['2026-10-07']);
    expect(publishedDuties(data, 'b', '2026-10-05')).toEqual([
      {
        date: '2026-10-05',
        groupId: 'metro',
        duty: 'day',
        heading: 'day heading',
        hours: win('08:00', '21:00'),
      },
      {
        date: '2026-10-06',
        groupId: 'thermi',
        duty: 'on-duty',
        heading: 'on-duty heading',
        hours: null,
      },
    ]);
    expect(publishedDuties(data, 'a', '2026-10-08')).toEqual([]);
    expect(publishedDuties(data, 'nobody', '2026-10-01')).toEqual([]);
  });
});

// --- Holidays ----------------------------------------------------------------

describe('holidays', () => {
  const weekendHeading = 'Διημερεύοντα Φαρμακεία (Σάββατο, Κυριακή και αργίες από 08:00 έως 21:00)';

  it('has no regular hours on a holiday that falls on a weekend; duty and dated hours still apply', () => {
    // 2026-08-15, Dormition, is a Saturday.
    const saturdayWeekly = weekly({ '6': [range('09:00', '14:00')] });
    const data = city(
      [pharmacy('weekly'), pharmacy('duty'), pharmacy('dated')],
      [day('2026-08-15', { metro: [section('day', win('08:00', '21:00'), ['duty'])] })],
      [
        extended(
          ['2026-08-01', '2026-08-31'],
          [
            ['weekly', saturdayWeekly],
            ['dated', dated({ '2026-08-15': [range('10:00', '13:00')] })],
          ],
        ),
      ],
    );
    const row = (date: string) =>
      ['weekly', 'duty', 'dated'].map((id) => status(data, id, at(date, '11:00')).state);
    // The ordinary Saturday a week later: only the weekly schedule is open.
    expect(row('2026-08-22')).toEqual(['open', 'closed', 'closed']);
    // On the holiday the weekly schedule is skipped, the duty and the dated schedule apply.
    expect(row('2026-08-15')).toEqual(['closed', 'open', 'open']);
  });

  it('has no regular hours on a weekday holiday (28 Oct) but a duty pharmacy is open', () => {
    // 2026-10-28 is a Wednesday, normally open until 14:30.
    const data = city(
      [pharmacy('plain'), pharmacy('duty')],
      [day('2026-10-28', { metro: [section('day', win('08:00', '21:00'), ['duty'])] })],
    );
    expect(describeStatus(status(data, 'plain', at('2026-10-28', '10:00')))).toBe(
      'closed, next 2026-10-29 08:00',
    );
    expect(describeStatus(status(data, 'duty', at('2026-10-28', '10:00')))).toBe(
      'open until 2026-10-28 21:00',
    );
    // The previous Wednesday for contrast.
    expect(status(data, 'plain', at('2026-10-21', '10:00')).state).toBe('open');
  });

  it('closes metro regular hours on 26 Oct but not those of Lagkadas', () => {
    // 2026-10-26 is a Monday.
    const data = city([
      pharmacy('metro', { groupId: 'metro' }),
      pharmacy('unknown', { groupId: null }),
      pharmacy('lagkadas', { groupId: 'lagkadas' }),
    ]);
    const states = (date: string) =>
      ['metro', 'unknown', 'lagkadas'].map((id) => status(data, id, at(date, '10:00')).state);
    expect(states('2026-10-26')).toEqual(['closed', 'closed', 'open']);
    expect(states('2026-11-02')).toEqual(['open', 'open', 'open']);
    expect(describeStatus(status(data, 'metro', at('2026-10-26', '10:00')))).toBe(
      'closed, next 2026-10-27 08:00',
    );
  });

  it('detects a weekday holiday from an "αργίες" duty heading that is not in the calendar', () => {
    // 2026-11-18 is an ordinary Wednesday.
    const data = city(
      [pharmacy('plain'), pharmacy('duty'), pharmacy('thermaikos', { groupId: 'thermaikos' })],
      [
        day('2026-11-18', {
          metro: [section('day', win('08:00', '21:00'), ['duty'], { heading: weekendHeading })],
          thermaikos: [section('day', win('08:00', '21:00'), ['thermaikos'], { heading: 'day' })],
        }),
      ],
    );
    expect(status(data, 'plain', at('2026-11-18', '10:00')).state).toBe('closed');
    expect(status(data, 'duty', at('2026-11-18', '10:00')).state).toBe('open');
    // Thermaikos's own list has no such heading, so the weekday is not a holiday for it.
    expect(status(data, 'thermaikos', at('2026-11-18', '10:00')).state).toBe('open');
    // The Wednesday before has no such list.
    expect(status(data, 'plain', at('2026-11-11', '10:00')).state).toBe('open');
  });

  it('does not treat the weekend heading as a holiday on Saturdays or Sundays', () => {
    const data = city(
      [pharmacy('a')],
      [
        day('2026-10-10', {
          metro: [section('day', win('08:00', '21:00'), ['a'], { heading: weekendHeading })],
        }),
      ],
    );
    // Monday is untouched by Saturday's list.
    expect(status(data, 'a', at(MONDAY, '10:00')).state).toBe('open');
  });

  it('skips duty extra hours on a holiday, but keeps them on other days', () => {
    // 2027-10-28 is a Thursday and a holiday; 2027-10-21 is an ordinary Thursday.
    const overnight = (date: string) =>
      day(date, {
        metro: [
          section('overnight', win('21:00', '00:00'), ['a'], {
            heading: overnightHeading,
            extraHours: [midday],
          }),
        ],
      });
    const data = city([pharmacy('a')], [overnight('2027-10-21'), overnight('2027-10-28')]);
    expect(status(data, 'a', at('2027-10-21', '15:00')).state).toBe('open');
    expect(status(data, 'a', at('2027-10-28', '15:00')).state).toBe('closed');
    // The overnight window itself is not an "except holidays" matter.
    expect(status(data, 'a', at('2027-10-28', '22:00')).state).toBe('open');
  });

  it('honours the moveable Easter holidays', () => {
    // Good Friday 2026-04-10 (a Friday): closed. Friday 2026-04-17: open.
    const data = city([pharmacy('a')]);
    expect(status(data, 'a', at('2026-04-10', '10:00')).state).toBe('closed');
    expect(status(data, 'a', at('2026-04-17', '10:00')).state).toBe('open');
    // Easter Monday 2026-04-13.
    expect(status(data, 'a', at('2026-04-13', '10:00')).state).toBe('closed');
  });
});

// --- Extended hours ----------------------------------------------------------

describe('extended hours', () => {
  const period: [string, string] = ['2026-09-01', '2026-10-31'];

  it('lets a weekly schedule replace the regular hours on the days it lists', () => {
    const data = city(
      [pharmacy('a')],
      [],
      [
        extended(period, [
          [
            'a',
            weekly({
              '1': [range('08:00', '20:00')], // replaces Monday's 08:00-14:30
              '6': [range('09:00', '18:00')], // Saturday, normally closed
            }),
          ],
        ]),
      ],
    );
    const cases: [string, string, string][] = [
      [MONDAY, '16:00', 'open until 2026-10-05 20:00'],
      [MONDAY, '20:00', 'closed, next 2026-10-06 08:00'],
      ['2026-10-03', '12:00', 'open until 2026-10-03 18:00'], // Saturday
      ['2026-10-03', '18:00', 'closed, next 2026-10-05 08:00'],
      ['2026-10-03', '08:59', 'closed, next 2026-10-03 09:00'],
      // Tuesday isn't listed, so the regular hours stand.
      [TUESDAY, '15:00', 'closed, next 2026-10-06 17:00'],
      // Sunday isn't listed either: closed.
      ['2026-10-04', '12:00', 'closed, next 2026-10-05 08:00'],
      // Outside the period nothing is replaced.
      ['2026-11-07', '12:00', 'closed, next 2026-11-09 08:00'],
      ['2026-11-02', '16:00', 'closed, next 2026-11-03 08:00'],
    ];
    for (const [date, time, expected] of cases) {
      expect(describeStatus(status(data, 'a', at(date, time))), `${date} ${time}`).toBe(expected);
    }
    const s = status(data, 'a', at(MONDAY, '16:00'));
    expect(s.state === 'open' && s.reasons).toEqual([{ kind: 'extended' }]);
  });

  it('applies the period boundaries inclusively', () => {
    const data = city(
      [pharmacy('a')],
      [],
      [extended(['2026-10-05', '2026-10-05'], [['a', weekly({ '1': [range('08:00', '20:00')] })]])],
    );
    expect(status(data, 'a', at(MONDAY, '16:00')).state).toBe('open'); // first and last day
    expect(status(data, 'a', at('2026-10-12', '16:00')).state).toBe('closed'); // next Monday
  });

  it('lets an explicitly empty weekday close the pharmacy', () => {
    const data = city([pharmacy('a')], [], [extended(period, [['a', weekly({ '1': [] })]])]);
    expect(status(data, 'a', at(MONDAY, '10:00')).state).toBe('closed');
    expect(status(data, 'a', at(TUESDAY, '10:00')).state).toBe('open');
  });

  it('applies split ranges of a weekly schedule', () => {
    const data = city(
      [pharmacy('a')],
      [],
      [
        extended(period, [
          ['a', weekly({ '1': [range('08:00', '14:30'), range('17:00', '21:00')] })],
        ]),
      ],
    );
    expect(describeStatus(status(data, 'a', at(MONDAY, '15:00')))).toBe(
      'closed, next 2026-10-05 17:00',
    );
    expect(describeStatus(status(data, 'a', at(MONDAY, '18:00')))).toBe(
      'open until 2026-10-05 21:00',
    );
  });

  it('lets a dated schedule replace the regular hours on its dates only', () => {
    const data = city(
      [pharmacy('a')],
      [],
      [
        extended(period, [
          [
            'a',
            dated({
              '2026-10-03': [range('08:00', '15:30')], // a Saturday
              '2026-10-05': [range('08:00', '21:00')], // a Monday
            }),
          ],
        ]),
      ],
    );
    expect(describeStatus(status(data, 'a', at('2026-10-03', '15:29')))).toBe(
      'open until 2026-10-03 15:30',
    );
    expect(describeStatus(status(data, 'a', at(MONDAY, '20:59')))).toBe(
      'open until 2026-10-05 21:00',
    );
    // 2026-10-06 isn't listed: the regular Tuesday applies.
    expect(describeStatus(status(data, 'a', at(TUESDAY, '15:00')))).toBe(
      'closed, next 2026-10-06 17:00',
    );
  });

  it('applies a dated schedule on a holiday but a weekly one not', () => {
    // 2026-10-28 is Ohi Day, a Wednesday.
    const data = city(
      [pharmacy('dated'), pharmacy('weekly')],
      [],
      [
        extended(period, [
          ['dated', dated({ '2026-10-28': [range('09:00', '14:00')] })],
          ['weekly', weekly({ '3': [range('09:00', '14:00')] })],
        ]),
      ],
    );
    expect(status(data, 'dated', at('2026-10-28', '10:00')).state).toBe('open');
    expect(status(data, 'weekly', at('2026-10-28', '10:00')).state).toBe('closed');
    expect(status(data, 'weekly', at('2026-10-21', '10:00')).state).toBe('open');
  });

  it('takes the newest period when two overlap', () => {
    const data = city(
      [pharmacy('a')],
      [],
      [
        extended(['2026-09-01', '2026-10-31'], [['a', weekly({ '1': [range('08:00', '12:00')] })]]),
        extended(['2026-10-01', '2026-10-31'], [['a', weekly({ '1': [range('08:00', '18:00')] })]]),
      ],
    );
    expect(describeStatus(status(data, 'a', at(MONDAY, '11:00')))).toBe(
      'open until 2026-10-05 18:00',
    );
  });

  it('merges extended hours with a duty window', () => {
    const data = city(
      [pharmacy('a')],
      [day(MONDAY, { metro: [section('overnight', win('21:00', '00:00'), ['a'])] })],
      [extended(period, [['a', weekly({ '1': [range('08:00', '21:00')] })]])],
    );
    const [only] = openIntervals(data, 'a', at(MONDAY, '00:00'), at(TUESDAY, '00:00'));
    expect(only && [local(only.start), local(only.end)]).toEqual([
      '2026-10-05 08:00',
      '2026-10-06 00:00',
    ]);
    expect(only?.reasons.map((r) => r.kind)).toEqual(['extended', 'duty']);
  });
});

// --- dutiesPublished and the horizon -------------------------------------------

describe('dutiesPublished', () => {
  const empty = (date: string) => day(date, { metro: [] });
  const check = (dates: string[], when: Date) =>
    pharmacyStatus(city([pharmacy('a')], dates.map(empty)), 'a', when);

  it('is false when today has no duty list', () => {
    expect(check([], at(MONDAY, '10:00')).dutiesPublished).toBe(false);
    expect(check([TUESDAY], at(MONDAY, '10:00')).dutiesPublished).toBe(false);
  });

  it('is true when today is published and the answer needs nothing else', () => {
    expect(check([MONDAY], at(MONDAY, '10:00')).dutiesPublished).toBe(true);
  });

  it('is false when the day of nextOpen has no list yet', () => {
    // Monday 15:00: closed, next open Tuesday 08:00, whose list is missing.
    const result = check([MONDAY], at(MONDAY, '15:00'));
    expect(describeStatus(result.status)).toBe('closed, next 2026-10-06 08:00');
    expect(result.dutiesPublished).toBe(false);
    expect(check([MONDAY, TUESDAY], at(MONDAY, '15:00')).dutiesPublished).toBe(true);
  });

  it('depends on the previous list too before 08:00', () => {
    expect(check([TUESDAY], at(TUESDAY, '03:00')).dutiesPublished).toBe(false);
    expect(check([MONDAY, TUESDAY], at(TUESDAY, '03:00')).dutiesPublished).toBe(true);
  });

  it('still answers from regular hours beyond the published range', () => {
    const data = city([pharmacy('a')], [empty(MONDAY)]);
    const result = pharmacyStatus(data, 'a', at('2027-01-04', '10:00')); // a Monday
    expect(describeStatus(result.status)).toBe('open until 2027-01-04 14:30');
    expect(result.dutiesPublished).toBe(false);
  });
});

describe('the look-ahead horizon', () => {
  it('finds the next opening up to 7 days ahead and gives up beyond', () => {
    // A city with no regular hours: only a duty far ahead opens it.
    const nowhere = {
      ...city(
        [pharmacy('a')],
        [
          day('2026-10-12', { metro: [section('day', win('08:00', '21:00'), ['a'])] }),
          day('2026-10-14', { metro: [section('day', win('08:00', '21:00'), ['a'])] }),
        ],
      ),
      city: { ...THESSALONIKI, id: 'nowhere' },
    };
    const s = (date: string, time: string) => describeStatus(status(nowhere, 'a', at(date, time)));
    expect(s('2026-10-05', '10:00')).toBe('closed, next 2026-10-12 08:00'); // 6.9 days away
    expect(s('2026-10-04', '10:00')).toBe('closed, next null'); // 7 days and 22 hours away
    expect(s('2026-10-12', '09:00')).toBe('open until 2026-10-12 21:00');
    expect(s('2026-10-12', '22:00')).toBe('closed, next 2026-10-14 08:00');
  });

  it('does not truncate `until` at the end of the query day', () => {
    // An after-midnight duty leading into a Sunday with a Sunday duty after it: one long opening.
    const data = city(
      [pharmacy('a')],
      [
        day('2026-10-10', { metro: [section('after-midnight', win('21:00', '08:00'), ['a'])] }),
        day('2026-10-11', { metro: [section('day', win('08:00', '21:00'), ['a'])] }),
      ],
    );
    expect(describeStatus(status(data, 'a', at('2026-10-10', '23:00')))).toBe(
      'open until 2026-10-11 21:00',
    );
  });
});

// --- openPharmacies ------------------------------------------------------------

describe('openPharmacies', () => {
  // Locations along the shore: Aristotelous Square is lon 22.9409, lat 40.6326.
  const origin = { lat: 40.6326, lon: 22.9409 };
  const at_ = (lat: number, lon: number) => ({
    lat,
    lon,
    source: 'override' as const,
    precision: 'exact' as const,
  });
  const data = city(
    [
      pharmacy('far', { name: 'Βασίλης', location: at_(40.7, 22.95) }),
      pharmacy('near', { name: 'Άννα', location: at_(40.633, 22.941) }),
      pharmacy('nowhere', { name: 'Αλέξης', location: null }),
      pharmacy('tie-b', { name: 'Μαρία', location: at_(40.64, 22.94) }),
      pharmacy('tie-a', { name: 'Ζωή', location: at_(40.64, 22.94) }),
      pharmacy('closed', { name: 'Γιώργος', location: at_(40.6327, 22.9409) }),
      pharmacy('unknown', { name: 'Θεανώ', groupId: 'thermi', location: at_(40.65, 22.94) }),
    ],
    [
      day(MONDAY, {
        metro: [
          section('overnight', win('21:00', '00:00'), ['far', 'near', 'nowhere', 'tie-a', 'tie-b']),
        ],
        thermi: [section('on-duty', null, ['unknown'])],
      }),
    ],
  );
  // Monday 22:00: only duty pharmacies are open; 'closed' isn't listed.
  const when = at(MONDAY, '22:00');

  it('lists only open and duty-hours-unknown pharmacies', () => {
    const states = openPharmacies(data, when).map((p) => [p.pharmacy.id, p.status.state]);
    expect(states).toEqual([
      ['nowhere', 'open'], // Αλέξης
      ['near', 'open'], // Άννα
      ['far', 'open'], // Βασίλης
      ['tie-a', 'open'], // Ζωή
      ['unknown', 'duty-hours-unknown'], // Θεανώ
      ['tie-b', 'open'], // Μαρία
    ]);
  });

  it('sorts by Greek name without an origin, with no distances', () => {
    const result = openPharmacies(data, when);
    expect(result.map((p) => p.pharmacy.name)).toEqual([
      'Αλέξης',
      'Άννα',
      'Βασίλης',
      'Ζωή',
      'Θεανώ',
      'Μαρία',
    ]);
    expect(result.every((p) => p.distance === null)).toBe(true);
  });

  it('sorts by distance with an origin, null distances last, ties by name', () => {
    const result = openPharmacies(data, when, { origin });
    expect(result.map((p) => p.pharmacy.id)).toEqual([
      'near',
      'tie-a', // same spot as tie-b: Ζωή before Μαρία
      'tie-b',
      'unknown',
      'far',
      'nowhere', // no location: last
    ]);
    const distances = result.map((p) => p.distance);
    expect(distances[5]).toBeNull();
    expect(distances[0]).toBeCloseTo(distanceMetres(origin, { lat: 40.633, lon: 22.941 }), 6);
    expect(distances.slice(0, 5).every((d) => d !== null)).toBe(true);
  });

  it('includes the status details of each result', () => {
    const near = openPharmacies(data, when, { origin })[0];
    expect(near?.status.state).toBe('open');
    expect(near?.status.state === 'open' && local(near.status.until)).toBe('2026-10-06 00:00');
    const unknown = openPharmacies(data, when).find((p) => p.pharmacy.id === 'unknown');
    expect(unknown && describeStatus(unknown.status)).toBe(
      'duty-hours-unknown, next 2026-10-06 08:00',
    );
  });

  it('is empty when nothing is open', () => {
    expect(openPharmacies(data, at('2026-10-10', '12:00'))).toEqual([]);
  });

  it('runs in under 50 ms over a thousand pharmacies and five duty days', () => {
    const many: Pharmacy[] = Array.from({ length: 1000 }, (_, i) =>
      pharmacy(String(1000 + i), {
        name: `Φαρμακείο ${i}`,
        groupId: i % 10 === 0 ? 'thermi' : 'metro',
        location: at_(40.55 + (i % 40) * 0.005, 22.85 + Math.floor(i / 40) * 0.01),
      }),
    );
    const days = ['2026-10-03', '2026-10-04', MONDAY, TUESDAY, '2026-10-07'].map((date) =>
      day(date, {
        metro: [
          section(
            'day',
            win('08:00', '21:00'),
            many.slice(0, 120).map((p) => p.id),
          ),
          section(
            'overnight',
            win('21:00', '00:00'),
            many.slice(120, 160).map((p) => p.id),
            {
              extraHours: [midday],
            },
          ),
          section(
            'after-midnight',
            win('21:00', '08:00'),
            many.slice(160, 170).map((p) => p.id),
          ),
        ],
        thermi: [
          section(
            'on-duty',
            null,
            many.slice(170, 190).map((p) => p.id),
          ),
        ],
      }),
    );
    const big = city(many, days, [
      extended(
        ['2026-09-01', '2026-10-31'],
        many.slice(200, 600).map((p): [string, Schedule] => [
          p.id,
          weekly({
            '6': [range('09:00', '15:00')],
            '1': [range('08:00', '14:30'), range('17:00', '21:00')],
          }),
        ]),
      ),
    ]);
    const times: number[] = [];
    for (const [date, time] of [
      [MONDAY, '10:00'],
      [MONDAY, '22:30'],
      [TUESDAY, '03:00'],
    ] as const) {
      const when_ = at(date, time);
      const best = Math.min(
        ...[0, 1, 2].map(() => {
          const start = performance.now();
          openPharmacies(big, when_, { origin });
          return performance.now() - start;
        }),
      );
      times.push(best);
    }
    expect(Math.max(...times)).toBeLessThan(50);
  });
});

describe('distanceMetres', () => {
  it('computes great-circle distances', () => {
    const a = { lat: 40.6326, lon: 22.9409 }; // Aristotelous Square
    const b = { lat: 40.6401, lon: 22.9444 }; // Thessaloniki's White Tower area
    expect(distanceMetres(a, a)).toBe(0);
    expect(distanceMetres(a, b)).toBeCloseTo(distanceMetres(b, a), 9);
    expect(distanceMetres(a, b)).toBeGreaterThan(800);
    expect(distanceMetres(a, b)).toBeLessThan(900);
    // One degree of latitude is about 111.2 km.
    expect(distanceMetres({ lat: 40, lon: 22 }, { lat: 41, lon: 22 })).toBeCloseTo(111_195, -2);
    // Athens to Thessaloniki is about 303 km.
    expect(distanceMetres({ lat: 37.9838, lon: 23.7275 }, a)).toBeCloseTo(303_000, -4);
  });
});
