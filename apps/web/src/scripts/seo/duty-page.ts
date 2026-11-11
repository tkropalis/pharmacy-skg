import { GREECE_TIME_ZONE, zonedParts } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
import { addDays } from '../../lib/dates.ts';
import { openCreditOnHover } from '../../lib/map-credit.ts';
import type { DutyPin } from './duty-map.ts';

/**
 * The live parts of a day's lists. The page is static and can be old, so whether it is today's
 * and which lists are on duty now are worked out here, in the city's time zone. Without
 * JavaScript the page is the lists alone.
 */

const locale: Locale = document.documentElement.lang === 'en' ? 'en' : 'el';

const minutesOf = (time: string | undefined): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(time ?? '');
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
};

/** Whether a list of `date` with these hours is on duty at `minutes` past midnight of `today`. */
function onDuty(section: HTMLElement, date: string, today: string, minutes: number): boolean {
  const from = minutesOf(section.dataset['from']);
  const to = minutesOf(section.dataset['to']);
  if (from === null || to === null) return false;
  const nextDay = section.dataset['nextDay'] === 'true';
  if (date === today) return minutes >= from && (nextDay || minutes < to);
  // Last night's list, still running this morning.
  return nextDay && addDays(date, 1) === today && minutes < to;
}

function markNow(root: HTMLElement): void {
  const date = root.dataset['date'] ?? '';
  const { date: today, minutes } = zonedParts(new Date(), GREECE_TIME_ZONE);
  for (const element of root.querySelectorAll<HTMLElement>('[data-today-only]')) {
    element.hidden = date !== today;
  }
  for (const section of root.querySelectorAll<HTMLElement>('.seo-section')) {
    const label = section.querySelector<HTMLElement>('[data-now]');
    if (label !== null) label.hidden = !onDuty(section, date, today, minutes);
  }
}

/** The map, once it is near the screen: the library is large, and the page must not wait for it. */
function setupMap(root: HTMLElement): void {
  const hero = document.querySelector<HTMLElement>('[data-duty-map]');
  const canvas = hero?.querySelector<HTMLElement>('[data-map-canvas]');
  if (!hero || !canvas) return;
  const credit = hero.querySelector<HTMLElement>('.seo-map-credit');
  if (credit !== null) openCreditOnHover(credit);
  const failed = () => {
    hero.dataset['state'] = 'failed';
  };
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData === true || !('IntersectionObserver' in window)) {
    failed();
    return;
  }
  const pins: DutyPin[] = [];
  const seen = new Set<string>();
  for (const row of root.querySelectorAll<HTMLElement>('li[data-lat][data-lon]')) {
    const key = `${row.dataset['lat']},${row.dataset['lon']}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pins.push({ lat: Number(row.dataset['lat']), lon: Number(row.dataset['lon']) });
  }
  if (pins.length === 0) {
    failed();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void import('./duty-map.ts')
        .then(({ showDutyMap }) =>
          showDutyMap(canvas, {
            locale,
            pins,
            onReady: () => {
              hero.dataset['state'] = 'ready';
            },
          }),
        )
        .catch(failed);
    },
    { rootMargin: '200px' },
  );
  observer.observe(hero);
}

const root = document.querySelector<HTMLElement>('[data-duty-page]');
if (root !== null) {
  markNow(root);
  setupMap(root);
  // The page can stay open past midnight or past the end of a list.
  setInterval(() => markNow(root), 60_000);
}
