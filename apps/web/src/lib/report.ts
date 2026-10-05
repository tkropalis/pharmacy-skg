import { REPO } from '../config.ts';

/** Problem types of the report form (decision D17). api/report.ts has the same list. */
export const REPORT_TYPES = [
  'wrong-hours',
  'closed-but-listed-open',
  'wrong-location',
  'wrong-phone',
  'other',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const MESSAGE_MAX = 1000;
export const PHARMACY_MAX = 120;

export interface ReportDraft {
  readonly pharmacy: string;
  readonly type: ReportType;
  readonly message: string;
}

export function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]+/g;

/** Removes control characters (including newlines) and collapses whitespace. */
export function singleLine(value: string): string {
  return value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

/** The pharmacy id from `?pharmacy=<id>`, cleaned, or '' when absent. */
export function pharmacyFromSearch(search: string): string {
  const value = new URLSearchParams(search).get('pharmacy') ?? '';
  return singleLine(value).slice(0, PHARMACY_MAX);
}

/**
 * A link that opens GitHub's "new issue" page with the report filled in: the fallback when the
 * serverless function is unavailable (no token configured, offline, errors).
 */
export function fallbackIssueUrl(
  draft: ReportDraft,
  typeLabel: string,
  titlePrefix: string,
  noPharmacyLabel: string,
): string {
  const pharmacy = singleLine(draft.pharmacy) || noPharmacyLabel;
  const title = `${titlePrefix}: ${typeLabel} — ${pharmacy}`;
  const body = [
    `**${typeLabel}**`,
    `${pharmacy}`,
    '',
    draft.message.trim().slice(0, MESSAGE_MAX),
  ].join('\n');
  const params = new URLSearchParams({ title, body, labels: 'report' });
  return `https://github.com/${REPO}/issues/new?${params.toString()}`;
}
