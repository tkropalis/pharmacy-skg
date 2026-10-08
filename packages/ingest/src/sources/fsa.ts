/**
 * Reads the Attica association's duty site (`fsa-efimeries.gr`, iteq/fsa.ts) the way its page
 * does: the home page for the dates on offer, then the form's results for each date. One request
 * at a time, at most one a second; no token or bot challenge is involved.
 */
import { parseFsaCards, parseFsaDates, type FsaCard } from '../iteq/fsa.ts';
import { USER_AGENT } from './http.ts';

const PAUSE_MS = 1000;

export class FsaClient {
  readonly origin = 'https://fsa-efimeries.gr';
  private lastRequest = 0;
  requests = 0;

  private async request(path: string, body?: URLSearchParams): Promise<string> {
    const wait = this.lastRequest + PAUSE_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      this.lastRequest = Date.now();
      this.requests++;
      try {
        const response = await fetch(`${this.origin}${path}`, {
          method: body ? 'POST' : 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html',
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
          ...(body ? { body } : {}),
          signal: AbortSignal.timeout(60_000),
        });
        if (response.ok) return await response.text();
        lastError = new Error(`HTTP ${response.status} for ${this.origin}${path}`);
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  /** The dates the site offers, from today. */
  async dates(): Promise<string[]> {
    return parseFsaDates(await this.request('/'));
  }

  /** Every pharmacy on duty on `date`, open now or not. */
  async day(date: string): Promise<FsaCard[]> {
    const body = new URLSearchParams({ Date: date, IsOpen: 'false' });
    return parseFsaCards(await this.request('/Home/FilteredHomeResults', body));
  }
}
