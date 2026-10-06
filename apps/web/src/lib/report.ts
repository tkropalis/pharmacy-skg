import { GREECE_TIME_ZONE } from '@pharmacy-skg/core';
import type { Locale } from '@pharmacy-skg/core';
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

/**
 * Where the form posts. vercel.json has `trailingSlash: true`, which redirects paths without a
 * slash; the slash form is the canonical one there, and a rewrite hands it to the function
 * (a POST must not depend on a redirect). The function answers on both forms.
 */
export const REPORT_ENDPOINT = '/api/report/';

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

/** The report type from `?type=<id>`, or null when absent or unknown. */
export function typeFromSearch(search: string): ReportType | null {
  const value = new URLSearchParams(search).get('type') ?? '';
  return isReportType(value) ? value : null;
}

export type SendResult =
  | { readonly kind: 'sent'; readonly issueUrl: string | null }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'network' };

/** Posts a report to the serverless function (decision D17). Never throws. */
export async function sendReport(
  draft: ReportDraft & { readonly website?: string },
  locale: Locale,
): Promise<SendResult> {
  try {
    const response = await fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, website: draft.website ?? '', locale }),
    });
    if (response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const issueUrl =
        typeof body === 'object' && body !== null && 'issueUrl' in body
          ? String((body as { issueUrl: unknown }).issueUrl)
          : null;
      return { kind: 'sent', issueUrl };
    }
    if (response.status === 400 || response.status === 413) return { kind: 'invalid' };
    return { kind: 'unavailable' };
  } catch {
    return { kind: 'network' };
  }
}

const reportTime = new Intl.DateTimeFormat('el', {
  timeZone: GREECE_TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * The message of a one-tap "found it closed" report: when, and what the app showed then. In
 * Greek, the language of the people who triage the issues (api/report.ts).
 */
export function closedReportMessage(at: Date, shown: string): string {
  return `Βρέθηκε κλειστό: ${reportTime.format(at)}. Η εφαρμογή έδειχνε: ${shown}.`;
}

/** The report form for one pharmacy, with the type chosen. */
export function reportFormSearch(pharmacy: string, type: ReportType): string {
  return `?${new URLSearchParams({ pharmacy, type }).toString()}`;
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
  const title = `${titlePrefix}: ${typeLabel}, ${pharmacy}`;
  const body = [
    `**${typeLabel}**`,
    `${pharmacy}`,
    '',
    draft.message.trim().slice(0, MESSAGE_MAX),
  ].join('\n');
  const params = new URLSearchParams({ title, body, labels: 'report' });
  return `https://github.com/${REPO}/issues/new?${params.toString()}`;
}
