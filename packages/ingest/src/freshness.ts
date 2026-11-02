import { GREECE_TIME_ZONE } from '@pharmacy-skg/core';

/** The app shows its stale-data banner after this long (docs/decisions.md, "Stale data"). */
export const STALE_AFTER_HOURS = 36;

/** What an area's meta.json says about when its sources were last read. */
export interface AreaMeta {
  /** The folder name under data/. */
  area: string;
  /** `checkedAt`, or `updatedAt` for a file written before `checkedAt` existed; undefined if neither is a date. */
  checkedAt: string | undefined;
}

export interface StaleArea {
  area: string;
  checkedAt: string | undefined;
  /** Whole hours since the check; undefined when the file has no usable date. */
  ageHours: number | undefined;
}

/** The areas last checked more than `thresholdHours` ago, or with no usable date, oldest first. */
export function staleAreas(
  areas: readonly AreaMeta[],
  now: Date,
  thresholdHours = STALE_AFTER_HOURS,
): StaleArea[] {
  const stale: StaleArea[] = [];
  for (const { area, checkedAt } of areas) {
    const time = checkedAt === undefined ? Number.NaN : Date.parse(checkedAt);
    if (Number.isNaN(time)) {
      stale.push({ area, checkedAt: undefined, ageHours: undefined });
      continue;
    }
    // The app's banner: strictly more than the threshold.
    if (now.getTime() - time > thresholdHours * 3_600_000) {
      stale.push({ area, checkedAt, ageHours: Math.floor((now.getTime() - time) / 3_600_000) });
    }
  }
  return stale.sort(
    (a, b) => (b.ageHours ?? Infinity) - (a.ageHours ?? Infinity) || a.area.localeCompare(b.area),
  );
}

/** A local date and time in Athens, such as "2026-10-22 06:41". */
function athensTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: GREECE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

/**
 * The text of the one open "stale-data" issue. It holds nothing that changes from day to day
 * (no ages, no run time), so the workflow edits the issue only when the list of areas or an
 * area's last check changes.
 */
export function issueBody(stale: readonly StaleArea[], total: number, workflowUrl: string): string {
  const rows = stale.map(
    ({ area, checkedAt }) =>
      `| \`${area}\` | ${checkedAt === undefined ? 'no valid date in meta.json' : athensTime(checkedAt)} |`,
  );
  return [
    `${stale.length} of ${total} areas were last checked more than ${STALE_AFTER_HOURS} hours ago. The app shows its stale-data banner for them.`,
    '',
    '| Area | Last checked (Athens time) |',
    '| --- | --- |',
    ...rows,
    '',
    `Check the latest [Update data runs](${workflowUrl}) for the cause. This issue is kept current by the Stale data workflow and closes by itself when every area is fresh.`,
  ].join('\n');
}
