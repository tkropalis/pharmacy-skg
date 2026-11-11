import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { t } from '../../i18n/index.ts';
import { realModel } from './test-data.ts';
import {
  areaIndexProps,
  areaPageProps,
  dutyIndexProps,
  dutyPageProps,
  dutyTodayPageProps,
  pharmacyPageProps,
  todayDutyDate,
} from './views.ts';
import { MAX_DUTY_PAGES, publishedDutyDates } from './model.ts';

const model = realModel('2026-10-05');
const larisa = realModel('2026-10-07', 'larisa');
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
    // data/ grows with every update, so the dates on disk are the expectation, not a snapshot.
    const onDisk = readdirSync(new URL('../../../../../data/thessaloniki/duties/', import.meta.url))
      .map((name) => name.slice(0, -'.json'.length))
      .sort();
    expect(model.publishedDates[0]).toBe('2026-09-28');
    expect(model.publishedDates).toEqual(publishedDutyDates(onDisk, '2026-10-05'));
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
    expect(el?.meta.title).toMatch(/^Φαρμακείο .+, /);
    expect(en?.meta.title).toMatch(/^Pharmacy .+, /);
    // One call button, its number spaced after the area code.
    expect(el?.callText).toMatch(/^Κλήση 23\d{2,3} \d+$/);
    expect(en?.callText).toMatch(/^Call 23\d{2,3} \d+$/);
  });

  it('is null for an unknown id', () => {
    expect(pharmacyPageProps(model, 'el', 'nope', ORIGIN)).toBeNull();
  });

  it('words the regular hours and links the report form with the id', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    expect(page?.regularHours?.text).toBe(
      'Συνηθισμένο ωράριο: Δευ/Τετ 08:00–14:30 · Τρί/Πέμ/Παρ 08:00–14:00, 17:00–21:00',
    );
    expect(page?.regularClosedText).toBe('Κλειστό: Σάβ/Κυρ και αργίες.');
    expect(page?.reportPath).toBe(`/anafora/?pharmacy=${id}`);
    expect(pharmacyPageProps(model, 'en', id, ORIGIN)?.reportPath).toBe(
      `/en/report/?pharmacy=${id}`,
    );
  });

  it('lists the published extended hours with the period and the announcement link', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    expect(page?.extendedHours.length).toBeGreaterThan(0);
    const [first] = page?.extendedHours ?? [];
    // Whichever two months the data holds now.
    expect(first?.periodText).toMatch(/^Από 1 \p{L}+ \d{4} έως 3[01] \p{L}+ \d{4}$/u);
    expect(first?.announcementUrl).toMatch(/^https:\/\/www\.pkm\.gov\.gr\//);
    expect(first?.lines.length).toBeGreaterThan(0);
  });

  it('lists only the duties from today on', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    for (const duty of page?.upcomingDuties ?? []) expect(duty.date >= '2026-10-05').toBe(true);
    expect(page?.upcomingDuties.length).toBeGreaterThan(0);
  });

  it('words each duty in plain words on one line, with only the extra hours of that date', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    const kinds = Object.values(t('el').app.status.kinds);
    for (const duty of page?.upcomingDuties ?? []) {
      expect(kinds).toContain(duty.kindLabel);
      expect(duty.dateLabel).toMatch(/^\S{3} \d{1,2} \S+$/);
      for (const extra of duty.extraHours) expect(extra).toMatch(/^\d\d:\d\d–\d\d:\d\d$/);
    }
  });

  it('links a duty to its date page only when that page exists', () => {
    const page = pharmacyPageProps(model, 'en', id, ORIGIN);
    for (const duty of page?.upcomingDuties ?? []) {
      expect(duty.pagePath !== null).toBe(model.publishedDates.includes(duty.date));
      if (duty.pagePath !== null) {
        expect(duty.pagePath).toBe(`/en/duty/thessaloniki/${duty.date}/`);
      }
    }
  });

  it('emits valid Pharmacy JSON-LD without opening hours', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    const [data, crumbs] = JSON.parse(page?.jsonLd ?? '') as Record<string, unknown>[];
    expect(data?.['@type']).toBe('Pharmacy');
    expect(data?.['url']).toBe(`${ORIGIN}/farmakeio/${id}/`);
    expect(data?.['hasMap']).toMatch(/^https:\/\/www\.google\.com\/maps\//);
    expect(data).not.toHaveProperty('openingHoursSpecification');
    expect(crumbs?.['@type']).toBe('BreadcrumbList');
    expect(page?.jsonLd).not.toContain('<');
  });

  it('writes an English page in Latin letters and keeps the Greek for the sign', () => {
    const page = pharmacyPageProps(model, 'en', id, ORIGIN);
    const greek = model.pharmacyById.get(id);
    expect(page?.name).toMatch(/^[\p{Script=Latin}\d\s.&()-]+$/u);
    expect(page?.address).not.toMatch(/\p{Script=Greek}/u);
    expect(page?.nativeName).toBe(greek?.name);
    expect(page?.nativeAddress).toBe(greek?.address);
    expect(page?.meta.title).not.toMatch(/\p{Script=Greek}/u);
    for (const line of page?.extendedHours.flatMap((e) => e.lines) ?? []) {
      expect(line).not.toMatch(/\p{Script=Greek}/u);
    }
    expect(pharmacyPageProps(model, 'el', id, ORIGIN)?.nativeName).toBeNull();
  });

  it('lists its nearest pharmacies, linked and with their distance', () => {
    const page = pharmacyPageProps(model, 'el', id, ORIGIN);
    expect(page?.nearby).toHaveLength(3);
    const [first] = page?.nearby ?? [];
    expect(first?.id).not.toBe(id);
    expect(first?.path).toBe(`/farmakeio/${first?.id}/`);
    expect(first?.distanceText).toMatch(/\d (μ|χλμ)$/);
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
    expect(el?.meta.title).toBe('Εφημερεύοντα φαρμακεία, Θεσσαλονίκη, Δευτέρα 5 Οκτωβρίου 2026');
    expect(en?.meta.title).toBe('Pharmacies on duty, Thessaloniki, Monday 5 October 2026');
    expect(el?.meta.description).toContain('Πηγή: Φαρμακευτικός Σύλλογος Θεσσαλονίκης.');
    expect(el?.meta.alternates).toEqual({
      el: '/efimeries/thessaloniki/2026-10-05/',
      en: '/en/duty/thessaloniki/2026-10-05/',
    });
    expect(el?.prev?.path).toBe('/efimeries/thessaloniki/2026-10-04/');
    expect(el?.next?.path).toBe('/efimeries/thessaloniki/2026-10-06/');
    expect(en?.next?.path).toBe('/en/duty/thessaloniki/2026-10-06/');
  });

  it("has a breadcrumb through the city's page for today", () => {
    expect(dutyPageProps(model, 'el', '2026-10-05')?.breadcrumbs).toEqual([
      { name: 'Εφημερίες ανά μέρα', path: '/efimeries/' },
      { name: 'Θεσσαλονίκη', path: '/efimeries/thessaloniki/' },
      { name: 'Δευτέρα 5 Οκτωβρίου 2026', path: '/efimeries/thessaloniki/2026-10-05/' },
    ]);
  });

  it('names the area groups a day has no list for', () => {
    // 1 Oct 2026 has the metro list only; 5 Oct has all ten.
    expect(dutyPageProps(model, 'el', '2026-10-05')?.missingGroups).toEqual([]);
    const metroOnly = dutyPageProps(model, 'el', '2026-10-01');
    expect(metroOnly?.missingGroups).toContain('Δήμος Θέρμης');
    expect(metroOnly?.missingGroups).toHaveLength(9);
    expect(metroOnly?.missingGroups).not.toContain('Θεσσαλονίκη');
    // By name in both languages, never by id, even for a group no loaded day has a list for.
    const en = dutyPageProps(model, 'en', '2026-10-01')?.missingGroups ?? [];
    expect(en).toContain('Dimos Thermis');
    expect(en.join(' ')).not.toMatch(/asvestochori|chalkidona|lagkadas|volvi\b/u);
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
      expect(group.sections.map((s) => s.kindLabel)).toEqual(
        source?.sections.map((s) => t('el').app.status.kinds[s.kind]),
      );
      expect(group.sections.flatMap((s) => s.entries).length).toBe(
        source?.sections.reduce((n, s) => n + s.entries.length, 0),
      );
    }
    const linked = page?.groups.flatMap((g) => g.sections.flatMap((s) => s.entries)) ?? [];
    expect(linked.every((e) => e.pagePath === `/farmakeio/${e.pharmacyId}/`)).toBe(true);
  });

  it('sets the date apart from the rest of the heading, and gives short dates to the days around', () => {
    const el = dutyPageProps(model, 'el', '2026-10-05');
    expect(el?.h1Lead).toBe('Εφημερεύοντα φαρμακεία, Θεσσαλονίκη');
    expect(`${el?.h1Lead}, ${el?.dateLabel}`).toBe(el?.h1);
    expect(el?.prev?.shortLabel).toBe('Κυρ 4 Οκτ');
    expect(dutyPageProps(model, 'en', '2026-10-05')?.next?.shortLabel).toBe('Tue 6 Oct');
  });

  it('lists the rows as the home screen does: short names, area first, sorted by area, a Call label', () => {
    const page = dutyPageProps(model, 'el', '2026-10-05');
    for (const group of page?.groups ?? []) {
      for (const section of group.sections) {
        const areas = section.entries.map((e) => e.place.split(' · ')[0] ?? '');
        for (const entry of section.entries) {
          expect(entry.name).not.toMatch(/\b(Ο\.?Ε|Ε\.?Ε|ΙΚΕ)\.?$/u);
          expect(entry.callLabel).toBe(t('el').app.row.callLabel.replace('{name}', entry.name));
        }
        // The rows without an area of their own (the city itself) come first, then by area.
        const named = areas.filter((_, i) => section.entries[i]?.place.includes(' · '));
        expect(named).toEqual([...named].sort(new Intl.Collator('el').compare));
      }
    }
    const rows = page?.groups.flatMap((g) => g.sections.flatMap((s) => s.entries)) ?? [];
    expect(rows.some((e) => e.location !== null)).toBe(true);
    // The city's own name is not repeated on every row.
    expect(rows.some((e) => e.place.startsWith('Θεσσαλονίκη · '))).toBe(false);
  });

  it('writes the names and places in Latin letters on English pages', () => {
    const rows =
      dutyPageProps(model, 'en', '2026-10-05')?.groups.flatMap((g) =>
        g.sections.flatMap((s) => s.entries),
      ) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const entry of rows) {
      expect(entry.name).not.toMatch(/[Α-Ωα-ω]/u);
      expect(entry.place).not.toMatch(/[Α-Ωα-ω]/u);
      expect(entry.callLabel).toBe(t('en').app.row.callLabel.replace('{name}', entry.name));
    }
  });
});

describe('todayDutyDate', () => {
  it("is today when today's list is published", () => {
    expect(todayDutyDate(model)).toBe('2026-10-05');
  });

  it('is the next published date when today has no list, else the last one', () => {
    const dates = ['2026-10-03', '2026-10-04', '2026-10-07'];
    const at = (today: string) => todayDutyDate({ ...model, today, publishedDates: dates });
    expect(at('2026-10-05')).toBe('2026-10-07');
    expect(at('2026-10-09')).toBe('2026-10-07');
    expect(todayDutyDate({ ...model, publishedDates: [] })).toBeNull();
  });
});

describe('dutyTodayPageProps', () => {
  const el = dutyTodayPageProps(model, 'el');
  const en = dutyTodayPageProps(model, 'en');

  it("shows today's lists at the city's own address, in both locales", () => {
    expect(el?.date).toBe('2026-10-05');
    expect(el?.meta.alternates).toEqual({
      el: '/efimeries/thessaloniki/',
      en: '/en/duty/thessaloniki/',
    });
    expect(el?.groups).toEqual(dutyPageProps(model, 'el', '2026-10-05')?.groups);
  });

  it('says today in the title and names the date in the heading', () => {
    expect(el?.meta.title).toBe('Εφημερεύοντα φαρμακεία σήμερα, Θεσσαλονίκη');
    expect(en?.meta.title).toBe('Pharmacies on duty today, Thessaloniki');
    expect(el?.meta.description).toContain('Πηγή: Φαρμακευτικός Σύλλογος Θεσσαλονίκης.');
    expect(el?.h1).toBe('Εφημερεύοντα φαρμακεία, Θεσσαλονίκη, Δευτέρα 5 Οκτωβρίου 2026');
  });

  it('ends its breadcrumb at the city and keeps the links to the days around it', () => {
    expect(el?.breadcrumbs.map((c) => c.path)).toEqual(['/efimeries/', '/efimeries/thessaloniki/']);
    expect(el?.prev?.path).toBe('/efimeries/thessaloniki/2026-10-04/');
    expect(el?.next?.path).toBe('/efimeries/thessaloniki/2026-10-06/');
  });
});

describe('dutyIndexProps', () => {
  it("lists every city's published dates, in order, in both locales", () => {
    const el = dutyIndexProps([model, larisa], 'el');
    const en = dutyIndexProps([model, larisa], 'en');
    expect(el.cities.map((c) => [c.id, c.name])).toEqual([
      ['thessaloniki', 'Θεσσαλονίκη'],
      ['larisa', 'Λάρισα'],
    ]);
    expect(el.cities[0]?.items.map((i) => i.date)).toEqual(model.publishedDates);
    expect(el.cities[1]?.items.map((i) => i.date)).toEqual(larisa.publishedDates);
    expect(el.meta.path).toBe('/efimeries/');
    expect(en.meta.path).toBe('/en/duty/');
    expect(en.cities[1]?.name).toBe('Larissa');
    expect(en.cities[0]?.items[0]?.path).toBe(`/en/duty/thessaloniki/${model.publishedDates[0]}/`);
    expect(el.cities[1]?.todayPath).toBe('/efimeries/larisa/');
    expect(en.cities[0]?.todayPath).toBe('/en/duty/thessaloniki/');
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

  it('describes an area with one pharmacy in the singular', () => {
    const single = model.areas.find((area) => area.pharmacies.length === 1);
    const several = model.areas.find((area) => area.pharmacies.length > 1);
    if (single === undefined || several === undefined) throw new Error('test data changed');
    const el = areaPageProps(model, 'el', single.slug)?.meta.description ?? '';
    const en = areaPageProps(model, 'en', single.slug)?.meta.description ?? '';
    expect(el).toMatch(/^Το φαρμακείο της περιοχής /);
    expect(en).toMatch(/^The pharmacy in /);
    expect(`${el} ${en}`).not.toMatch(/\b1 (φαρμακεία|pharmacies)/);
    expect(areaPageProps(model, 'el', several.slug)?.meta.description).toMatch(
      new RegExp(`^Τα ${several.pharmacies.length} φαρμακεία `),
    );
  });

  it('uses the Greek name in Greek and a transliteration in English', () => {
    const el = areaPageProps(model, 'el', 'nea-michaniona');
    const en = areaPageProps(model, 'en', 'nea-michaniona');
    expect(el?.h1).toBe('Φαρμακεία: Νέα Μηχανιώνα');
    expect(en?.h1).toBe('Pharmacies in Nea Michaniona (Νέα Μηχανιώνα)');
    expect(el?.breadcrumbs).toEqual([
      { name: 'Όλες οι περιοχές', path: '/perioxi/' },
      { name: 'Νέα Μηχανιώνα', path: '/perioxi/thessaloniki/nea-michaniona/' },
    ]);
    expect(en?.meta.alternates).toEqual({
      el: '/perioxi/thessaloniki/nea-michaniona/',
      en: '/en/area/thessaloniki/nea-michaniona/',
    });
  });

  it('lists published duty dates from today onward, only for pharmacies in the locality', () => {
    const page = areaPageProps(model, 'el', 'thessaloniki');
    expect(page?.dutyDays.length).toBeGreaterThan(0);
    for (const day of page?.dutyDays ?? []) {
      expect(day.date >= '2026-10-05').toBe(true);
      expect(day.pagePath).toBe(`/efimeries/thessaloniki/${day.date}/`);
      expect(day.items.length).toBeGreaterThan(0);
    }
  });

  it('names the city in the title, unless the area is the city itself', () => {
    expect(areaPageProps(model, 'el', 'nea-michaniona')?.meta.title).toBe(
      'Φαρμακεία Νέα Μηχανιώνα, Θεσσαλονίκη: ωράριο και εφημερίες',
    );
    expect(areaPageProps(model, 'en', 'nea-michaniona')?.meta.title).toBe(
      'Pharmacies in Nea Michaniona, Thessaloniki: hours and duty days',
    );
    expect(areaPageProps(model, 'el', 'thessaloniki')?.meta.title).toBe(
      'Φαρμακεία Θεσσαλονίκη: ωράριο και εφημερίες',
    );
    expect(areaPageProps(larisa, 'el', 'tyrnavos')?.meta.title).toBe(
      'Φαρμακεία Τύρναβος, Λάρισα: ωράριο και εφημερίες',
    );
  });
});

describe('areaIndexProps', () => {
  it("lists every city's areas exactly once, grouped by duty group", () => {
    const page = areaIndexProps([model, larisa], 'el');
    const [thessaloniki, larissa] = page.cities;
    const slugs = thessaloniki?.groups.flatMap((g) => g.areas.map((a) => a.slug)) ?? [];
    expect(slugs.sort()).toEqual(model.areas.map((a) => a.slug).sort());
    const metro = thessaloniki?.groups.find((g) => g.id === 'metro');
    expect(metro?.areas.map((a) => a.slug)).toContain('thessaloniki');
    expect(thessaloniki?.flat).toBe(false);
    expect(metro?.areas.find((a) => a.slug === 'kalamaria')?.path).toBe(
      '/perioxi/thessaloniki/kalamaria/',
    );
    // Larissa's sectors are towns: one list, no group headings.
    expect(larissa?.flat).toBe(true);
    expect(larissa?.groups.flatMap((g) => g.areas.map((a) => a.slug)).sort()).toEqual(
      larisa.areas.map((a) => a.slug).sort(),
    );
    expect(page.meta.path).toBe('/perioxi/');
    expect(areaIndexProps([model], 'en').meta.path).toBe('/en/area/');
  });
});

describe('a city without regular hours (Larissa)', () => {
  const id = '2410672566';

  it('says to call for the hours instead of printing regular hours', () => {
    const page = pharmacyPageProps(larisa, 'el', id, ORIGIN);
    expect(page?.regularHours).toBeNull();
    expect(page?.regularClosedText).toBeNull();
    expect(page?.areaPagePath).toBe('/perioxi/larisa/larisa/');
  });

  it("names the city and its association on its duty pages, under the city's path", () => {
    const date = larisa.publishedDates[0] ?? '';
    const page = dutyPageProps(larisa, 'el', date);
    expect(page?.meta.title).toMatch(/^Εφημερεύοντα φαρμακεία, Λάρισα, /);
    expect(page?.meta.description).toContain('Πηγή: Φαρμακευτικός Σύλλογος Λάρισας.');
    expect(page?.meta.path).toBe(`/efimeries/larisa/${date}/`);
    expect(page?.groups.map((g) => g.name)).toContain('Τύρναβος');
  });
});
