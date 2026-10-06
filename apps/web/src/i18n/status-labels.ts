import type { DutyKind, Locale } from '@pharmacy-skg/core';

/**
 * The status labels, defined once. The home screen (app.*.ts), the pharmacy, duty-date and
 * area pages (el.ts/en.ts) and the about page all read these, so the same state always reads
 * the same (docs/decisions.md, Defaults: status labels). Everyday words only: no source names,
 * no "extended hours". A pharmacy on extended hours reads "Open" like one on regular hours,
 * and has the same marker on the map. Status is never shown by colour alone: the label is
 * always text.
 *
 * `midnight` replaces "tomorrow 00:00" as an end time: "έως τα μεσάνυχτα", "until midnight".
 * `notOnDuty` replaces "closed" where a city's regular hours are not known (decision D26): the
 * pharmacy may well be open, only not on duty.
 */
export const STATUS_LABELS = {
  el: {
    onDuty: 'Εφημερεύει',
    openRegular: 'Ανοιχτό',
    openExtended: 'Ανοιχτό',
    dutyUnknown: 'Εφημερεύει, καλέστε για το ωράριο',
    notOnDuty: 'Δεν εφημερεύει',
    midnight: 'τα μεσάνυχτα',
  },
  en: {
    onDuty: 'On duty',
    openRegular: 'Open',
    openExtended: 'Open',
    dutyUnknown: 'On duty, call for the hours',
    notOnDuty: 'Not on duty',
    midnight: 'midnight',
  },
} as const satisfies Record<Locale, Record<string, string>>;

/**
 * The kinds of duty a published list has, in plain words, defined once for the home screen's
 * favourites and the duty-date, pharmacy and area pages (docs/decisions.md, Defaults: plain
 * words). The printed headings ("Διανυκτερεύοντα", "Μεταμεσονύκτια") stay in the PDFs. The
 * hours always follow the label, so "Νυχτερινή" covers both 21:00–00:00 (the city) and
 * 21:00–08:00 (some outlying groups); the all-night lists start at 21:00, not after midnight.
 */
export const DUTY_KIND_LABELS = {
  el: {
    day: 'Εφημερία ημέρας',
    'saturday-extra': 'Εφημερία Σαββάτου',
    'on-duty': 'Εφημερία',
    overnight: 'Νυχτερινή εφημερία',
    'after-midnight': 'Εφημερία όλη τη νύχτα',
  },
  en: {
    day: 'Day duty',
    'saturday-extra': 'Saturday duty',
    'on-duty': 'On duty',
    overnight: 'Night duty',
    'after-midnight': 'All-night duty',
  },
} as const satisfies Record<Locale, Record<DutyKind, string>>;
