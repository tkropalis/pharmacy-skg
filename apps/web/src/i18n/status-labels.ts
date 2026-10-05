import type { Locale } from '@pharmacy-skg/core';

/**
 * The status labels, defined once. The home screen (app.*.ts), the pharmacy, duty-date and
 * area pages (el.ts/en.ts) and the legend all read these, so the same state always reads the
 * same (docs/decisions.md, Defaults: status labels). The wording follows the source:
 * "λίστα ΦΣΘ" for the duty list, and ΠΚΜ's own term "διευρυμένο ωράριο" for extended hours.
 * Status is never shown by colour alone: the label is always text.
 */
export const STATUS_LABELS = {
  el: {
    onDuty: 'Εφημερεύει (λίστα ΦΣΘ)',
    openRegular: 'Ανοιχτό (κανονικό ωράριο)',
    openExtended: 'Ανοιχτό (διευρυμένο ωράριο)',
  },
  en: {
    onDuty: 'On duty (ΦΣΘ list)',
    openRegular: 'Open (regular hours)',
    openExtended: 'Open (extended hours)',
  },
} as const satisfies Record<Locale, Record<string, string>>;
