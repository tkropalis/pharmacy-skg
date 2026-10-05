import type { Locale } from '@pharmacy-skg/core';

/**
 * The status labels, defined once. The home screen (app.*.ts), the pharmacy, duty-date and
 * area pages (el.ts/en.ts) and the about page all read these, so the same state always reads
 * the same (docs/decisions.md, Defaults: status labels). Everyday words only: no source names,
 * no "extended hours". A pharmacy on extended hours reads "Open" like one on regular hours;
 * the map marker's shape and the legend tell them apart. Status is never shown by colour
 * alone: the label is always text.
 */
export const STATUS_LABELS = {
  el: {
    onDuty: 'Εφημερεύει',
    openRegular: 'Ανοιχτό',
    openExtended: 'Ανοιχτό',
    dutyUnknown: 'Εφημερεύει, καλέστε για το ωράριο',
  },
  en: {
    onDuty: 'On duty',
    openRegular: 'Open',
    openExtended: 'Open',
    dutyUnknown: 'On duty, call for the hours',
  },
} as const satisfies Record<Locale, Record<string, string>>;
