import { describe, expect, it } from 'vitest';
import { AREA_GROUPS } from './fsth/groups.ts';
import type { DutyDay, DutyGroup, Pharmacy } from './schema.ts';
import { validate } from './validate.ts';

const pharmacy = (id: string, located = true): Pharmacy => ({
  id,
  name: `ΦΑΡΜΑΚΕΙΟ ${id}`,
  address: 'ΟΔΟΣ 1',
  locality: 'Θεσσαλονίκη',
  postcode: null,
  phone: id,
  groupId: 'metro',
  location: located ? { lat: 40.63, lon: 22.94, source: 'overture', precision: 'exact' } : null,
  sources: ['fsth'],
  firstSeen: '2026-10-04',
  lastSeen: '2026-10-04',
});

const ids = Array.from({ length: 300 }, (_, i) => String(2310000000 + i));
const entry = (id: string) => ({
  pharmacyId: id,
  name: 'X',
  address: 'Y',
  locality: 'Z',
  phone: id,
});

function group(id: string, counts: { overnight: number; afterMidnight: number }): DutyGroup {
  const source = { url: 'https://example.org/x.pdf', uploadedAt: '2026-10-01T00:00:00Z' };
  if (id !== 'metro') {
    return {
      id,
      name: id,
      source,
      sections: [
        {
          kind: 'on-duty',
          heading: 'h',
          hours: null,
          extraHours: [],
          notes: [],
          entries: [entry(ids[299] ?? '')],
        },
      ],
    };
  }
  return {
    id,
    name: id,
    source,
    sections: [
      {
        kind: 'overnight',
        heading: 'h',
        hours: { from: '21:00', to: '00:00', toNextDay: true },
        extraHours: [],
        notes: [],
        entries: ids.slice(0, counts.overnight).map(entry),
      },
      {
        kind: 'after-midnight',
        heading: 'h',
        hours: { from: '21:00', to: '08:00', toNextDay: true },
        extraHours: [],
        notes: [],
        entries: ids.slice(100, 100 + counts.afterMidnight).map(entry),
      },
    ],
  };
}

function day(
  date: string,
  counts = { overnight: 28, afterMidnight: 6 },
  groups = AREA_GROUPS.map((g) => g.id),
): DutyDay {
  return { schemaVersion: 1, date, groups: groups.map((id) => group(id, counts)) };
}

describe('validate', () => {
  const pharmacies = ids.map((id) => pharmacy(id));

  it('accepts a complete, plausible data set', () => {
    const report = validate({
      today: '2026-10-05',
      days: [day('2026-10-05'), day('2026-10-06')],
      pharmacies,
      extended: [],
    });
    expect(report.errors).toEqual([]);
  });

  it('rejects counts outside the expected ranges', () => {
    const report = validate({
      today: '2026-10-05',
      days: [day('2026-10-05', { overnight: 2, afterMidnight: 6 }), day('2026-10-06')],
      pharmacies,
      extended: [],
    });
    expect(report.errors.map((e) => e.code)).toContain('count');
  });

  it('rejects a missing area group for today, but only warns for later days', () => {
    const report = validate({
      today: '2026-10-05',
      days: [day('2026-10-05', undefined, ['metro']), day('2026-10-09', undefined, ['metro'])],
      pharmacies,
      extended: [],
    });
    expect(report.errors.filter((e) => e.code === 'missing-group')).toHaveLength(1);
    expect(report.warnings.filter((e) => e.code === 'missing-group')).toHaveLength(1);
  });

  it('rejects an on-duty pharmacy without a location', () => {
    const report = validate({
      today: '2026-10-05',
      days: [day('2026-10-05'), day('2026-10-06')],
      pharmacies: pharmacies.map((p, i) => (i === 0 ? pharmacy(p.id, false) : p)),
      extended: [],
    });
    expect(report.errors.map((e) => e.code)).toContain('no-location');
  });

  it('warns when tomorrow has no list yet', () => {
    const report = validate({
      today: '2026-10-05',
      days: [day('2026-10-05')],
      pharmacies,
      extended: [],
    });
    expect(report.warnings.map((e) => e.code)).toContain('coverage');
  });
});
