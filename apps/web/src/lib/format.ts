import type { Locale } from '@pharmacy-skg/core';
import { THESSALONIKI, zonedParts } from '@pharmacy-skg/core';

const TIME_ZONE = THESSALONIKI.timeZone;

/** Replaces `{name}` placeholders in a dictionary string. Unknown names are left as written. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "21:00": the wall clock in the city's zone, 24-hour in both languages. */
export function formatClock(at: Date, timeZone: string = TIME_ZONE): string {
  const { minutes } = zonedParts(at, timeZone);
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

const intlLocale = (locale: Locale): string => (locale === 'el' ? 'el-GR' : 'en-GB');

/** "Wednesday" / "Τετάρτη" in the city's zone. */
export function weekdayName(at: Date, locale: Locale, timeZone: string = TIME_ZONE): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', timeZone }).format(at);
}

/** "Wed 7 Oct" / "Τετ 7 Οκτ" in the city's zone. */
export function shortDate(at: Date, locale: Locale, timeZone: string = TIME_ZONE): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(at);
}

/** "Wed 7 Oct" for an ISO date (calendar date, no zone involved). */
export function shortIsoDate(date: string, locale: Locale): string {
  return shortDate(new Date(`${date}T12:00:00Z`), locale, 'UTC');
}

/** 350 → "350 m", 1234 → "1.2 km" / "1,2 km": locale-formatted, the same unit in both languages. */
export function formatDistance(metres: number, locale: Locale): string {
  const number = (value: number, digits: number) =>
    new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(value);
  if (metres < 1000) return `${number(Math.max(10, Math.round(metres / 10) * 10), 0)} m`;
  return `${number(metres / 1000, metres < 10_000 ? 1 : 0)} km`;
}

/**
 * True when the device's clock, read in its own zone, shows a different date or time than the
 * city's at the same instant, so the page should say that it uses the city's time.
 */
export function deviceZoneDiffers(at: Date, timeZone: string = TIME_ZONE): boolean {
  try {
    const city = zonedParts(at, timeZone);
    const device = new Intl.DateTimeFormat('en-US', {
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
    const pick = (type: string) => Number(device.find((p) => p.type === type)?.value ?? NaN);
    const deviceDate = `${pick('year')}-${pad2(pick('month'))}-${pad2(pick('day'))}`;
    return deviceDate !== city.date || pick('hour') * 60 + pick('minute') !== city.minutes;
  } catch {
    return false;
  }
}

/** "30 Σεπτεμβρίου 2026" / "30 September 2026" for an ISO date (calendar date, no zone). */
export function longIsoDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "8,19 €" / "€8.19". */
export function formatPrice(euros: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'EUR' }).format(
    euros,
  );
}
