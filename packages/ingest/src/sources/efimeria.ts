/**
 * Reads Achaia's duty page, efimeria.gr/All, which carries every area's duties for today and the
 * longer hours (efimeria/parse.ts). The owner approved reading it on 2 Nov 2026, with the
 * project's own User-Agent, at most a request a second (a run makes one); the site's robots.txt
 * names AI crawlers, so no User-Agent that looks like one is ever used (decision D26).
 */
import { parseEfimeriaPage, type EfimeriaPage } from '../efimeria/parse.ts';
import { HttpClient, type HttpTransport } from './http.ts';

export const EFIMERIA_ORIGIN = 'https://www.efimeria.gr';

export class EfimeriaClient {
  private readonly http: HttpClient;

  constructor(transport: HttpTransport = {}) {
    this.http = new HttpClient({ ...transport, pauseMs: 1000 });
  }

  /** Requests made, retries included. */
  get requests(): number {
    return this.http.requests;
  }

  /** Today's page, every area. */
  async page(): Promise<EfimeriaPage> {
    return parseEfimeriaPage(
      await this.http.text(`${EFIMERIA_ORIGIN}/All`, { accept: 'text/html' }),
    );
  }
}
