import { describe, expect, it } from 'vitest';
import { realModel } from './test-data.ts';
import {
  areaIndexProps,
  areaPageProps,
  dutyIndexProps,
  dutyPageProps,
  pharmacyPageProps,
} from './views.ts';
import { MAX_DUTY_PAGES, publishedDutyDates } from './model.ts';

const model = realModel('2026-10-05');
const ORIGIN = 'https://example.test';

/** A pharmacy that is on today's duty list and has ΠΚΜ extended hours. */
function richPharmacyId(): string {
  const onDuty = new Set(model.listingsByPharmacy.keys());
  const extended = new Set(model.extendedHours.flatMap((f) => f.entries.map((e) => e.pharmacyId)));
  const id = [...onDuty].find(
    (candidate) =>
      extended.has(candidate) &&
      (model.listingsByPharmacy.get(candidate) ?? []).some((l) => l.date >= model.today),
  );
  if (id === undefined) throw new Error('fixture has no pharmacy with duty and extended hours');
  return id;
}

describe('publishedDutyDates', () => {
  it('keeps the data window: seven days back and everything after', () => {
    const dates = ['2026-09-27', '2026-09-28', '2026-10-05', '2026-10-09'];
    expect(publishedDutyDates(dates, '2026-10-05')).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-09',
    ]);
  });

  it('never exceeds the page cap', () => {
    const dates = Array.from(
      { length: 100 },
      (_, i) => `2027-01-${String(i + 1).padStart(2, '0')}`,
    );
    expect(publishedDutyDates(dates, '2026-12-31')).toHaveLength(MAX_DUTY_PAGES);
  });

  it('matches the model built from the real data', () => {
    expect(model.publishedDates[0]).toBe('2026-09-28');
    expect(model.publishedDates.at(-1)).toBe('2026-10-08');
    expect(model.publishedDates).toHaveLength(11);
  });
});

describe('pharmacyPageProps', () => {
  const id = richPharmacyId();

  it('builds both locales with the same page for the other language', () => {
    const el = pharmacyPageProps(model, 'el', id, ORIGIN);
    const en = pharmacyPageProps(model, 'en', id, ORIGIN);
    expect(el?.meta.path).toBe(`/farmakeio/${id}/`);
    expect(en?.meta.path).toBe(`/en/pharmacy/${id}/`);
    expect(el?.meta.alternates).toEqual({ el: `/farmakeio/${id}/`, en: `/en/pharmacy/${id}/` });
    expect(en?.meta.alternates).toEqual(el?.meta.alternates);
    expect(el?.meta.title).toContain('Φαρμακείο');
    expect(en?.meta.title).toContain('Pharmacy in');
  });

  it('is null for an unknown id', () => {
    expect(pharmacyPageProps(model, 'el', 'nope', ORIGIN)).toBeNull();
  });

  it('words the regular hours and links the report form with the id', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    expect(page?.regularHours.text).toBe(
      'Κανονικό ωράριο: Δευ/Τετ 08:00–14:30 · Τρί/Πέμ/Παρ 08:00–14:00, 17:00–21:00',
    );
    expect(page?.regularClosedText).toBe('Κλειστά: Σάβ/Κυρ και αργίες.');
    expect(page?.reportPath).toBe(`/anafora/?pharmacy=${id}`);
    expect(pharmacyPageProps(model, 'en', id, ORIGIN)?.reportPath).toBe(
      `/en/report/?pharmacy=${id}`,
    );
  });

  it('lists the published extended hours with the period and the announcement link', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    expect(page?.extendedHours.length).toBeGreaterThan(0);
    const [first] = page?.extendedHours ?? [];
    expect(first?.periodText).toBe('Ισχύει από 1 Σεπτεμβρίου 2026 έως 31 Οκτωβρίου 2026');
    expect(first?.announcementUrl).toMatch(/^https:\/\/www\.pkm\.gov\.gr\//);
    expect(first?.scheduleText.length).toBeGreaterThan(0);
  });

  it('splits duties into upcoming (from today) and the last 14 days, newest recent first', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    for (const duty of page?.upcomingDuties ?? []) expect(duty.date >= '2026-10-05').toBe(true);
    const recent = page?.recentDuties ?? [];
    for (const duty of recent) {
      expect(duty.date < '2026-10-05').toBe(true);
      expect(duty.date >= '2026-09-21').toBe(true);
    }
    const dates = recent.map((d) => d.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(page?.upcomingDuties.length).toBeGreaterThan(0);
  });

  it('links a duty to its date page only when that page exists', () => {
    const page = pharmacyPageProps(model, 'en', id, ORIGIN);
    for (const duty of [...(page?.upcomingDuties ?? []), ...(page?.recentDuties ?? [])]) {
      expect(duty.pagePath !== null).toBe(model.publishedDates.includes(duty.date));
      if (duty.pagePath !== null) expect(duty.pagePath).toBe(`/en/duty/${duty.date}/`);
    }
  });

  it('emits valid Pharmacy JSON-LD without opening hours', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    const data = JSON.parse(page?.jsonLd ?? '') as Record<string, unknown>;
    expect(data['@type']).toBe('Pharmacy');
    expect(data['url']).toBe(`${ORIGIN}/farmakeio/${id}/`);
    expect(data).not.toHaveProperty('openingHoursSpecification');
    expect(JSON.stringify(data)).not.toContain('<');
  });

  it('has a page for every pharmacy', () => {
    for (const pharmacy of model.pharmacies) {
      expect(pharmacyPageProps(model, 'el', pharmacy.id, ORIGIN)).not.toBeNull();
    }
  });
});

describe('dutyPageProps', () => {
  it('builds a page for every published date and none for others', () => {
    for (const date of model.publishedDates) {
      expect(dutyPageProps(model, 'el', date)).not.toBeNull();
    }
    expect(dutyPageProps(model, 'el', '2026-09-01')).toBeNull();
    expect(dutyPageProps(model, 'el', '2030-01-01')).toBeNull();
  });

  it('has the dated title, both locales and previous/next links', () => {
    const el = dutyPageProps(model, 'el', '2026-10-05');
    const en = dutyPageProps(model, 'en', '2026-10-05');
    expect(el?.meta.title).toBe('Εφημερεύοντα φαρμακεία Θεσσαλονίκη — Δευτέρα 5 Οκτωβρίου 2026');
    expect(en?.meta.title).toBe('On-duty pharmacies in Thessaloniki — Monday 5 October 2026');
    expect(el?.meta.alternates).toEqual({
      el: '/efimeries/2026-10-05/',
      en: '/en/duty/2026-10-05/',
    });
    expect(el?.prev?.path).toBe('/efimeries/2026-10-04/');
    expect(el?.next?.path).toBe('/efimeries/2026-10-06/');
    expect(en?.next?.path).toBe('/en/duty/2026-10-06/');
  });

  it('has no previous link on the first date and no next link on the last', () => {
    expect(dutyPageProps(model, 'el', model.publishedDates[0] ?? '')?.prev).toBeNull();
    expect(dutyPageProps(model, 'el', model.publishedDates.at(-1) ?? '')?.next).toBeNull();
  });

  it('prints every group and section as published, with source links and pharmacy links', () => {
    const page = dutyPageProps(model, 'el', '2026-10-05');
    const day = model.duties.get('2026-10-05');
    expect(page?.groups.map((g) => g.id)).toEqual(day?.groups.map((g) => g.id));
    for (const [index, group] of (page?.groups ?? []).entries()) {
      const source = day?.groups[index];
      expect(group.sourceUrl).toBe(source?.source.url);
      expect(group.sections.map((s) => s.heading)).toEqual(source?.sections.map((s) => s.heading));
      expect(group.sections.flatMap((s) => s.entries).length).toBe(
        source?.sections.reduce((n, s) => n + s.entries.length, 0),
      );
    }
    const linked = page?.groups.flatMap((g) => g.sections.flatMap((s) => s.entries)) ?? [];
    expect(linked.every((e) => e.pagePath === `/farmakeio/${e.pharmacyId}/`)).toBe(true);
  });
});

describe('dutyIndexProps', () => {
  it('lists every published date, in order, in both locales', () => {
    const el = dutyIndexProps(model, 'el');
    const en = dutyIndexProps(model, 'en');
    expect(el.items.map((i) => i.date)).toEqual(model.publishedDates);
    expect(el.meta.path).toBe('/efimeries/');
    expect(en.meta.path).toBe('/en/duty/');
    expect(en.items[0]?.path).toBe(`/en/duty/${model.publishedDates[0]}/`);
  });
});

describe('areaPageProps', () => {
  it('builds a page for every area, with its pharmacies sorted by name', () => {
    for (const area of model.areas) {
      const page = areaPageProps(model, 'el', area.slug);
      expect(page?.pharmacies).toHaveLength(area.pharmacies.length);
    }
    expect(areaPageProps(model, 'el', 'nowhere')).toBeNull();
  });

  it('uses the Greek name in Greek and a transliteration in English', () => {
    const el = areaPageProps(model, 'el', 'nea-michaniona');
    const en = areaPageProps(model, 'en', 'nea-michaniona');
    expect(el?.h1).toBe('Φαρμακεία: Νέα Μηχανιώνα');
    expect(en?.h1).toBe('Pharmacies in Nea Michaniona (Νέα Μηχανιώνα)');
    expect(en?.meta.alternates).toEqual({
      el: '/perioxi/nea-michaniona/',
      en: '/en/area/nea-michaniona/',
    });
  });

  it('lists published duty dates from today onward, only for pharmacies in the locality', () => {
    const page = areaPageProps(model, 'el', 'thessaloniki');
    expect(page?.dutyDays.length).toBeGreaterThan(0);
    for (const day of page?.dutyDays ?? []) {
      expect(day.date >= '2026-10-05').toBe(true);
      expect(day.pagePath).toBe(`/efimeries/${day.date}/`);
      expect(day.items.length).toBeGreaterThan(0);
    }
  });
});

describe('areaIndexProps', () => {
  it('lists every area exactly once, grouped by ΦΣΘ group', () => {
    const page = areaIndexProps(model, 'el');
    const slugs = page.groups.flatMap((g) => g.areas.map((a) => a.slug));
    expect(slugs.sort()).toEqual(model.areas.map((a) => a.slug).sort());
    const metro = page.groups.find((g) => g.id === 'metro');
    expect(metro?.areas.map((a) => a.slug)).toContain('thessaloniki');
    expect(page.meta.path).toBe('/perioxi/');
    expect(areaIndexProps(model, 'en').meta.path).toBe('/en/area/');
  });
});
