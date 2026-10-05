import { addDays, localToInstant } from '@pharmacy-skg/core';
import type { Pharmacy, PublishedDuty } from '@pharmacy-skg/core';

/**
 * iCalendar (RFC 5545) export of officially published duty dates (decision D10). Pure: the
 * caller supplies the clock and the texts.
 */
export interface IcsTexts {
  /** "Εφημερία: {name}" */
  readonly summary: string;
  /** "Πηγή: ΦΣΘ" */
  readonly source: string;
  /** "Καλέστε πριν πάτε." */
  readonly callFirst: string;
  readonly calendarName: string;
}

export type IcsWhen =
  | { readonly kind: 'instants'; readonly start: Date; readonly end: Date }
  | { readonly kind: 'day'; readonly date: string };

export interface IcsEvent {
  readonly uid: string;
  readonly when: IcsWhen;
  readonly summary: string;
  readonly location: string;
  readonly description: string;
}

const CRLF = '\r\n';
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** "20261024T190000Z" */
export function utcStamp(at: Date): string {
  return (
    `${pad(at.getUTCFullYear(), 4)}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  );
}

/** "20261024" for a YYYY-MM-DD date. */
const dateValue = (date: string): string => date.replaceAll('-', '');

/** TEXT values: backslash, semicolon, comma and newlines are escaped (RFC 5545, 3.3.11). */
export function escapeText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\;')
    .replaceAll(',', '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Folds a content line so no line is longer than 75 octets, counting the CRLF + space that
 * starts each continuation (RFC 5545, 3.1). A multi-byte character is never split.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // the continuation's leading space takes one octet
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function whenLines(when: IcsWhen): string[] {
  if (when.kind === 'day') {
    // All-day: DTEND is exclusive, so it is the next day.
    return [
      `DTSTART;VALUE=DATE:${dateValue(when.date)}`,
      `DTEND;VALUE=DATE:${dateValue(addDays(when.date, 1))}`,
    ];
  }
  return [`DTSTART:${utcStamp(when.start)}`, `DTEND:${utcStamp(when.end)}`];
}

/** A complete VCALENDAR with CRLF line endings, ready to be saved as .ics. */
export function buildIcs(events: readonly IcsEvent[], now: Date, calendarName: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//pharmacy-skg//duty dates//EL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${utcStamp(now)}`,
      ...whenLines(event.when),
      `SUMMARY:${escapeText(event.summary)}`,
      `LOCATION:${escapeText(event.location)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/**
 * One event per published duty section: the section's printed hours converted from the city's
 * zone to UTC, or an all-day event when the heading prints none.
 */
export function dutyEvents(
  pharmacy: Pick<Pharmacy, 'id' | 'name' | 'address' | 'locality' | 'phone'>,
  duties: readonly PublishedDuty[],
  texts: IcsTexts,
  timeZone: string,
): IcsEvent[] {
  return duties.map((duty) => {
    const { hours } = duty;
    const when: IcsWhen =
      hours === null
        ? { kind: 'day', date: duty.date }
        : {
            kind: 'instants',
            start: localToInstant(duty.date, hours.from, timeZone),
            end: localToInstant(hours.toNextDay ? addDays(duty.date, 1) : duty.date, hours.to, timeZone),
          };
    const description = [
      duty.heading,
      texts.source,
      ...(pharmacy.phone ? [pharmacy.phone] : []),
      texts.callFirst,
    ].join('\n');
    return {
      uid: `${pharmacy.id}-${duty.date}-${duty.duty}-${duty.groupId}@pharmacy-skg`,
      when,
      summary: texts.summary.replace('{name}', pharmacy.name),
      location: [pharmacy.address, pharmacy.locality].filter((s) => s !== '').join(', '),
      description,
    };
  });
}

/** Saves text as a file through a temporary link (no server involved). */
export function downloadTextFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
