/**
 * The hours printed on an ITeQ duty card. Each association writes them its own way, all seen on
 * 7 Oct 2026 (fixtures/iteq):
 *
 * - "ΑΠΟ 08:00 ΕΩΣ 23:00", "08:00 ΕΩΣ 20:00", "14:30-22:00": one window;
 * - "08:00 ΕΩΣ 14:00 & 17:00 ΕΩΣ 08:00 ΕΠΟΜΕΝΗΣ": two, the second ending the next morning;
 * - "8 ΠΡΩΙ - 9 ΒΡΑΔΥ", "8:30 ΠΡΩΙ - 2:30 ΜΕΣΗΜΕΡΙ & 5:30 ΑΠΟΓΕΥΜΑ - 8 ΠΡΩΙ ΕΠΟΜΕΝΗΣ": the hour
 *   of the day in words;
 * - "ΔΙΑΝΥΚΤΕΡΕΥΕΙ 23:00 ΕΩΣ 08:00", "ΔΙΑΝΥΚΤΕΡΕΥΕΙ ΑΠΟ 8:30 ΕΩΣ 8:30 ΠΡΩΙ": overnight;
 * - "ΕΦΗΜΕΡΕΥΕΙ": on duty, no hours;
 * - a trailing "*": on call. The site's note says such a pharmacy may close at midday and the
 *   pharmacist is not in it overnight, but serves whoever phones.
 */
import type { DutyKind, TimeWindow } from '@pharmacy-skg/core';
import { isoWeekday } from '@pharmacy-skg/core';

export interface IteqDuty {
  readonly kind: DutyKind;
  readonly hours: TimeWindow | null;
  readonly onCall: boolean;
}

const PERIOD = 'ΠΡΩΙ|ΜΕΣΗΜΕΡΙ|ΑΠΟΓΕΥΜΑ|ΒΡΑΔΥ|ΝΥΧΤΑ|ΜΕΣΑΝΥΧΤΑ';
const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(${PERIOD})?`;
const WINDOW = new RegExp(String.raw`${TIME}\s*(?:ΕΩΣ|-|–)\s*${TIME}(\s*ΕΠΟΜΕΝΗΣ)?`);

/** Upper case, without accents or diaeresis: "Πρωί", "ΠΡΩΪ" and "ΠΡΩΙ" read the same. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "08:30" from the hour, the minutes and the part of the day, or null when it makes no sense. */
function clock(hourText: string, minuteText: string | undefined, period: string | undefined) {
  let hour = Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  // A bare "8" could be anything: a time needs its minutes or a part of the day.
  if (minuteText === undefined && period === undefined) return null;
  if (minute > 59) return null;
  switch (period) {
    case undefined:
      if (hour > 24) return null;
      if (hour === 24) hour = 0;
      break;
    case 'ΠΡΩΙ':
      if (hour < 1 || hour > 12) return null;
      if (hour === 12) hour = 0;
      break;
    case 'ΜΕΣΗΜΕΡΙ':
      // "12 ΜΕΣΗΜΕΡΙ" is noon; "2:30 ΜΕΣΗΜΕΡΙ" is 14:30.
      if (hour >= 1 && hour <= 5) hour += 12;
      else if (hour !== 11 && hour !== 12) return null;
      break;
    case 'ΑΠΟΓΕΥΜΑ':
    case 'ΒΡΑΔΥ':
      if (hour < 1 || hour > 12) return null;
      // "12 ΒΡΑΔΥ" is midnight.
      hour = hour === 12 ? (period === 'ΒΡΑΔΥ' ? 0 : 12) : hour + 12;
      break;
    case 'ΝΥΧΤΑ':
      if (hour === 12) hour = 0;
      else if (hour >= 7 && hour <= 11) hour += 12;
      else if (hour < 1 || hour > 6) return null;
      break;
    case 'ΜΕΣΑΝΥΧΤΑ':
      if (hour !== 12) return null;
      hour = 0;
      break;
  }
  return `${pad(hour)}:${pad(minute)}`;
}

/** The kind of one window on `date`. */
function kindOf(hours: TimeWindow, date: string): DutyKind {
  // A window into the next day: on duty from the morning (often 24 hours), or a night duty.
  if (hours.toNextDay) return hours.from < '12:00' ? 'on-duty' : 'overnight';
  // The Saturday-morning rota ends by early afternoon.
  if (isoWeekday(date) === 6 && hours.from < '12:00' && hours.to <= '15:00') {
    return 'saturday-extra';
  }
  return 'day';
}

/**
 * The duties a card's heading states on `date`: one per window it prints, or one without hours.
 * Null for a heading that names no duty, or prints hours we cannot read in full.
 */
export function iteqDuties(heading: string, date: string): IteqDuty[] | null {
  const text = plain(heading)
    // "(ΠΡΟΑΙΡΕΤΙΚΗ ΜΕΣΗΜΒΡΙΝΗ ΔΙΑΚΟΠΗ)" and similar notes say nothing about the hours.
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const onCall = text.includes('*');
  const bare = text.replace(/\*/g, '').trim();

  if (!/\d/.test(bare)) {
    if (/ΔΙΑΝΥΚΤΕΡΕΥ/.test(bare)) return [{ kind: 'overnight', hours: null, onCall }];
    if (/ΕΦΗΜΕΡΕΥ/.test(bare)) return [{ kind: 'on-duty', hours: null, onCall }];
    return null;
  }

  const duties: IteqDuty[] = [];
  for (const part of bare.split('&')) {
    const match = WINDOW.exec(part);
    if (!match) return null;
    const [, fromHour = '', fromMinute, fromPeriod, toHour = '', toMinute, toPeriod, next] = match;
    const from = clock(fromHour, fromMinute, fromPeriod);
    const to = clock(toHour, toMinute, toPeriod);
    if (from === null || to === null) return null;
    const hours: TimeWindow = { from, to, toNextDay: next !== undefined || to <= from };
    duties.push({ kind: kindOf(hours, date), hours, onCall });
  }
  return duties;
}
