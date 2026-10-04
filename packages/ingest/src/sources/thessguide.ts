/**
 * thess.guide re-hosts the ΦΣΘ duty PDFs unchanged, a few days ahead. We read
 * them from there because fsth.gr blocks automated clients (docs/research.md,
 * section 1). Files are listed through the WordPress media API.
 */
import { z } from 'zod';
import { getJson } from './http.ts';

const API = 'https://www.thess.guide/wp-json/wp/v2/media';

export interface DutyPdfLink {
  /** Duty date (YYYY-MM-DD) taken from the file name. */
  readonly date: string;
  readonly url: string;
  /** Upload time as an ISO timestamp in UTC. */
  readonly uploadedAt: string;
}

const MediaSchema = z.array(
  z.object({ source_url: z.string(), date_gmt: z.string(), mime_type: z.string() }),
);

/** Reads the duty date from a file name like "Εφημερίες_05-10-2026-2-1.pdf". */
export function dutyDateFromUrl(url: string): string | null {
  const file = decodeURIComponent(url.split('/').at(-1) ?? '');
  const match = /^Εφημερίες_(\d{2})-(\d{2})-(\d{4})(?:-\d+)*\.pdf$/u.exec(file.normalize('NFC'));
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * Lists duty PDFs, newest uploads first, until it reaches uploads older than
 * `uploadedSince` (ISO date). Every day has one PDF per area group.
 */
export async function listDutyPdfs(uploadedSince: string): Promise<DutyPdfLink[]> {
  const links: DutyPdfLink[] = [];
  for (let page = 1; page <= 50; page++) {
    const params = new URLSearchParams({
      search: 'Εφημερίες',
      per_page: '100',
      page: String(page),
      orderby: 'date',
      order: 'desc',
      after: `${uploadedSince}T00:00:00`,
      _fields: 'source_url,date_gmt,mime_type',
    });
    let items: z.infer<typeof MediaSchema>;
    try {
      items = MediaSchema.parse(await getJson(`${API}?${params}`));
    } catch (error) {
      // WordPress answers 400 for a page past the end.
      if (page > 1 && String(error).includes('HTTP 400')) break;
      throw error;
    }
    for (const item of items) {
      const date = dutyDateFromUrl(item.source_url);
      if (!date || item.mime_type !== 'application/pdf') continue;
      links.push({ date, url: item.source_url, uploadedAt: `${item.date_gmt}Z` });
    }
    if (items.length < 100) break;
  }
  return links;
}
