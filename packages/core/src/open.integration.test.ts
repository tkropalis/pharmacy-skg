/**
 * The engine against the real published data in data/thessaloniki. The expected
 * sets are worked out here from the raw JSON, with plain string and number
 * comparisons, and share no code with the engine.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THESSALONIKI } from './city.ts';
import type { DutyDay, ExtendedHours, Pharmacies } from './data.ts';
import { openPharmacies, pharmacyStatus } from './open.ts';
import type { CityData } from './open.ts';

const DATA_DIR = resolve(import.meta.dirname, '../../../data/thessaloniki');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR, path), 'utf8')) as T;
}

function load(): CityData {
  const duties = new Map<string, DutyDay>();
  for (const file of readdirSync(resolve(DATA_DIR, 'duties')).filter((f) => f.endsWith('.json'))) {
    const day = readJson<DutyDay>(`duties/${file}`);
    duties.set(day.date, day);
  }
  const extendedHours = readdirSync(resolve(DATA_DIR, 'extended-hours'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<ExtendedHours>(`extended-hours/${f}`));
  return {
    city: THESSALONIKI,
    pharmacies: readJson<Pharmacies>('pharmacies.json').pharmacies,
    duties,
    extendedHours,
  };
}

const data = load();

/** Previous calendar date, by plain UTC arithmetic. */
function previous(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

/**
 * Who is open at local `date` `time` (HH:MM) in a non-holiday week, by reading the raw files:
 * - `windowed`: a duty window or extended-hours range covers the time;
 * - `noHours`: on the duty list of the duty day (08:00 to 08:00) but the heading prints no hours.
 * Regular hours are not considered, so use a time outside 08:00-21:00.
 */
function expectedOpen(date: string, time: string) {
  const windowed = new Set<string>();
  const noHours = new Set<string>();
  const weekday = weekdayOf(date);

  // Duty windows that start on `date` (from <= time) or the day before and run past midnight.
  for (const [listDate, started] of [
    [date, true],
    [previous(date), false],
  ] as const) {
    for (const group of data.duties.get(listDate)?.groups ?? []) {
      for (const section of group.sections) {
        const ids = section.entries.map((e) => e.pharmacyId);
        const { hours } = section;
        if (hours === null) {
          const dutyDayIsThisOne = started ? time >= '08:00' : time < '08:00';
          if (dutyDayIsThisOne) ids.forEach((id) => noHours.add(id));
          continue;
        }
        const covers = started
          ? hours.from <= time && (hours.toNextDay || time < hours.to)
          : hours.toNextDay && time < hours.to;
        if (covers) ids.forEach((id) => windowed.add(id));
        if (started) {
          for (const extra of section.extraHours) {
            if (extra.weekdays.includes(weekday) && extra.from <= time && time < extra.to) {
              ids.forEach((id) => windowed.add(id));
            }
          }
        }
      }
    }
  }

  for (const period of data.extendedHours) {
    if (date < period.period.from || date > period.period.to) continue;
    for (const entry of period.entries) {
      const ranges =
        entry.schedule.type === 'weekly'
          ? entry.schedule.days[String(weekday)]
          : entry.schedule.dates[date];
      if (ranges?.some((r) => r.from <= time && time < r.to)) windowed.add(entry.pharmacyId);
    }
  }
  return { windowed, noHours };
}

const sorted = (ids: Iterable<string>) => [...ids].sort();

describe('real data, Monday 2026-10-05 at 22:30 Athens time', () => {
  // 22:30 EEST (UTC+3) is 19:30 UTC.
  const when = new Date('2026-10-05T19:30:00Z');
  const expected = expectedOpen('2026-10-05', '22:30');
  const result = openPharmacies(data, when);

  it('opens exactly the pharmacies the raw files put on duty at that time', () => {
    const all = new Set([...expected.windowed, ...expected.noHours]);
    expect(expected.windowed.size).toBeGreaterThan(40); // the overnight and outlying shifts
    expect(sorted(result.map((p) => p.pharmacy.id))).toEqual(sorted(all));
  });

  it('marks duty lists without hours as such, and the rest as open', () => {
    const unknown = result.filter((p) => p.status.state === 'duty-hours-unknown');
    expect(sorted(unknown.map((p) => p.pharmacy.id))).toEqual(
      sorted([...expected.noHours].filter((id) => !expected.windowed.has(id))),
    );
    expect(unknown.length).toBeGreaterThan(0);
    expect(result.filter((p) => p.status.state === 'open')).toHaveLength(expected.windowed.size);
  });

  it('ends a metro overnight shift at midnight', () => {
    const metro = data.duties.get('2026-10-05')?.groups.find((g) => g.id === 'metro');
    const overnight = metro?.sections.find((s) => s.kind === 'overnight');
    const id = overnight?.entries[0]?.pharmacyId ?? '';
    expect(id).not.toBe('');
    const { status } = pharmacyStatus(data, id, when);
    expect(status.state === 'open' && status.until.toISOString()).toBe('2026-10-05T21:00:00.000Z');
  });

  it('keeps an after-midnight pharmacy open past 08:00 into the next day', () => {
    const metro = data.duties.get('2026-10-05')?.groups.find((g) => g.id === 'metro');
    const night = metro?.sections.find((s) => s.kind === 'after-midnight');
    const id = night?.entries[0]?.pharmacyId ?? '';
    expect(id).not.toBe('');
    const { status } = pharmacyStatus(data, id, when);
    expect(status.state === 'open' && status.until.getTime()).toBeGreaterThanOrEqual(
      Date.parse('2026-10-06T05:00:00Z'),
    );
  });

  it('reports published duties for the day', () => {
    expect(pharmacyStatus(data, result[0]?.pharmacy.id ?? '', when).dutiesPublished).toBe(true);
  });
});

describe('real data, Tuesday 2026-10-06 at 03:00 Athens time', () => {
  // 03:00 EEST (UTC+3) is 00:00 UTC.
  const when = new Date('2026-10-06T00:00:00Z');
  const expected = expectedOpen('2026-10-06', '03:00');
  const result = openPharmacies(data, when);

  it('opens only the after-midnight and other windows still running', () => {
    const all = new Set([...expected.windowed, ...expected.noHours]);
    expect(sorted(result.map((p) => p.pharmacy.id))).toEqual(sorted(all));
  });

  it('includes the metro after-midnight shift of the 5th, dated by its list', () => {
    const metro = data.duties.get('2026-10-05')?.groups.find((g) => g.id === 'metro');
    const night = metro?.sections.find((s) => s.kind === 'after-midnight');
    const ids = night?.entries.map((e) => e.pharmacyId) ?? [];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const found = result.find((p) => p.pharmacy.id === id);
      expect(found?.status.state).toBe('open');
      const reasons = found?.status.state === 'open' ? found.status.reasons : [];
      expect(reasons).toContainEqual(
        expect.objectContaining({ kind: 'duty', duty: 'after-midnight', date: '2026-10-05' }),
      );
    }
  });

  it('is a far shorter list than at 22:30: no overnight (00:00) shift and no regular hours', () => {
    const overnight22 = openPharmacies(data, new Date('2026-10-05T19:30:00Z'));
    expect(result.length).toBeLessThan(overnight22.length / 2);
  });
});

describe('real data, sanity', () => {
  it('has regular hours in the morning of an ordinary weekday', () => {
    // Monday 2026-10-05 at 10:00 Athens: every pharmacy is open by regular hours.
    const result = openPharmacies(data, new Date('2026-10-05T07:00:00Z'));
    expect(result).toHaveLength(data.pharmacies.length);
  });

  it('closes the metro group on 26 Oct 2026 apart from duty and extended hours', () => {
    // Monday 2026-10-26, 10:00 Athens: Αγίου Δημητρίου. Keep only the duty lists published
    // by 8 Oct (later ones arrive as the data refreshes), so the answer is regular and
    // extended hours alone.
    const early: CityData = {
      ...data,
      duties: new Map([...data.duties].filter(([date]) => date <= '2026-10-08')),
    };
    const result = openPharmacies(early, new Date('2026-10-26T07:00:00Z'));
    const metroOpen = result.filter(
      (p) => (p.pharmacy.groupId ?? 'metro') === 'metro' && p.status.state === 'open',
    );
    for (const { status } of metroOpen) {
      expect(status.state === 'open' && status.reasons.map((r) => r.kind)).toEqual(['extended']);
    }
    const outlying = result.filter((p) => (p.pharmacy.groupId ?? 'metro') !== 'metro');
    expect(outlying.length).toBe(
      data.pharmacies.filter((p) => (p.groupId ?? 'metro') !== 'metro').length,
    );
  });
});
