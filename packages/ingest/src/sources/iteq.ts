/**
 * Reads an ITeQ duty site (`<area>.efhmeries.gr`) the way a browser does: the home page (today,
 * the dates on offer and the form's token), then the form for each other date, and a details page
 * for each pharmacy whose coordinates are not known yet. One request at a time, at most one a
 * second; no bot challenge is involved (docs/research-greece.md, section 2).
 */
import { parseIteqDetails, parseIteqPage, type IteqPage } from '../iteq/parse.ts';
import { HttpClient, type HttpTransport } from './http.ts';

const PAUSE_MS = 1000;

export class IteqClient {
  readonly origin: string;
  private readonly cookies = new Map<string, string>();
  private token: string | null = null;
  private readonly http: HttpClient;

  constructor(host: string, transport: HttpTransport = {}) {
    this.origin = `https://${host}`;
    this.http = new HttpClient({
      ...transport,
      pauseMs: PAUSE_MS,
      headers: (): Record<string, string> =>
        this.cookies.size > 0
          ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
          : {},
      onResponse: (response) => {
        for (const cookie of response.headers.getSetCookie()) {
          const [pair = ''] = cookie.split(';');
          const at = pair.indexOf('=');
          if (at > 0) this.cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
        }
      },
    });
  }

  /** Requests made, retries included. */
  get requests(): number {
    return this.http.requests;
  }

  private request(path: string, form?: URLSearchParams): Promise<string> {
    return this.http.text(`${this.origin}${path}`, {
      accept: 'text/html',
      ...(form ? { form } : {}),
    });
  }

  /** Today's page, with the dates on offer. */
  async home(): Promise<IteqPage> {
    const page = parseIteqPage(await this.request('/'));
    this.token = page.token;
    return page;
  }

  /** The page for one date, every sector (after `home`, which provides the form's token). */
  async day(date: string): Promise<IteqPage> {
    if (this.token === null)
      throw new Error(`${this.origin}: no form token; load the home page first`);
    const body = new URLSearchParams({ date, tomeas: '', __RequestVerificationToken: this.token });
    const page = parseIteqPage(await this.request('/tomeas', body));
    this.token = page.token ?? this.token;
    return page;
  }

  detailsUrl(id: string): string {
    return `${this.origin}/Home/Details/${id}`;
  }

  /** A pharmacy's coordinates, from its details page; null when it has none. */
  async details(id: string): Promise<{ lat: number; lon: number } | null> {
    return parseIteqDetails(await this.request(`/Home/Details/${id}`));
  }
}
