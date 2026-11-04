import { describe, expect, it } from 'vitest';
import { cityById } from '@pharmacy-skg/core';
import type { City, CityData, DutyDay, Pharmacy } from '@pharmacy-skg/core';
import { t } from '../../i18n/index.ts';
import { weekHours } from './week-hours.ts';

const city = cityById('thessaloniki') as City;
const labels = t('el');
const pharmacy = {
  id: 'p1',
  name: 'ΔΟΚΙΜΗ',
  address: '',
  locality: 'Θεσσαλονίκη',
  postcode: null,
  phone: null,
  groupId: 'metro',
  sources: [],
  firstSeen: '2026-01-01',
  lastSeen: '2026-01-01',
  location: null,
} as unknown as Pharmacy;

function dutyDay(date: string, hours: unknown, ids: string[]): DutyDay {
  return {
    schemaVersion: 1,
    date,
    groups: [
      {
        id: 'metro',
        name: 'Θεσσαλονίκη',
        sourceUrl: 'https://example.test',
        sections: [
          {
            kind: 'overnight',
            heading: 'Διανυκτερεύοντα',
            hours,
            extraHours: [],
            notes: [],
            entries: ids.map((pharmacyId) => ({ pharmacyId, name: '', address: '', phone: '' })),
          },
        ],
      },
    ],
  } as unknown as DutyDay;
}

function cityData(days: readonly DutyDay[]): CityData {
  return {
    city,
    pharmacies: [pharmacy],
    duties: new Map(days.map((day) => [day.date, day])),
    extendedHours: [],
  };
}

// Monday 2 Nov 2026, 10:00 in Athens.
const NOW = new Date('2026-11-02T08:00:00Z');
const week = ['02', '03', '04', '05', '06', '07', '08'].map((d) => `2026-11-${d}`);
const allPublished = week.map((date) => dutyDay(date, null, []));

describe('weekHours', () => {
  it('lists seven days from today, with the regular hours and the closed weekend', () => {
    const days = weekHours(cityData(allPublished), 'p1', NOW, 'el', labels);
    expect(days.map((d) => d.label).slice(0, 3)).toEqual(['Σήμερα', 'Αύριο', 'Τετ 4 Νοε']);
    expect(days[0]).toMatchObject({ today: true, hours: '08:00–14:30', duty: null });
    expect(days[1]?.hours).toBe('08:00–14:00, 17:00–21:00');
    expect(days[5]).toMatchObject({ hours: 'Κλειστό', none: true });
  });

  it('shows a night duty whole, on the day it starts', () => {
    const night = { from: '21:00', to: '08:00', toNextDay: true };
    const data = cityData(
      allPublished.map((day) =>
        day.date === '2026-11-07' ? dutyDay(day.date, night, ['p1']) : day,
      ),
    );
    const days = weekHours(data, 'p1', NOW, 'el', labels);
    expect(days[5]).toMatchObject({ hours: '21:00–08:00', duty: 'Εφημερεύει', none: false });
    expect(days[6]).toMatchObject({ hours: 'Κλειστό', duty: null });
  });

  it('says a duty without printed hours in words', () => {
    const data = cityData(
      allPublished.map((day) =>
        day.date === '2026-11-07' ? dutyDay(day.date, null, ['p1']) : day,
      ),
    );
    const days = weekHours(data, 'p1', NOW, 'el', labels);
    expect(days[5]).toMatchObject({ hours: '', duty: labels.status.dutyUnknown });
  });

  it('marks a day as unknown where the regular hours are not known, never as closed', () => {
    const larisa = cityById('larisa') as City;
    const data = { ...cityData(allPublished), city: larisa };
    const days = weekHours(data, 'p1', NOW, 'el', labels);
    expect(days.every((day) => day.unknown && day.hours === '')).toBe(true);
  });

  it('never says closed for a day whose duties are not announced yet', () => {
    const days = weekHours(cityData(allPublished.slice(0, 2)), 'p1', NOW, 'el', labels);
    expect(days[5]).toMatchObject({ hours: labels.seo.pharmacy.dutyNotAnnounced, none: true });
  });
});
