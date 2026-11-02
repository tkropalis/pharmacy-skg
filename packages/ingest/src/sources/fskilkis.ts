/**
 * Reads the Kilkis association's duty site (`fskilkis.gr/efimeries`, fskilkis/parse.ts): the
 * index page for the monthly articles, then the article of each town and month. One request at a
 * time, at most one a second.
 */
import {
  parseKilkisDays,
  parseKilkisIndex,
  type KilkisArticle,
  type KilkisDay,
} from '../fskilkis/parse.ts';
import { HttpClient, type HttpTransport } from './http.ts';

const PAUSE_MS = 1000;

export class KilkisClient {
  readonly origin = 'https://www.fskilkis.gr';
  private readonly http: HttpClient;

  /** `transport` is what a test replaces: the network and the clock. */
  constructor(transport: HttpTransport = {}) {
    this.http = new HttpClient({ ...transport, pauseMs: PAUSE_MS });
  }

  /** Requests made, retries included. */
  get requests(): number {
    return this.http.requests;
  }

  /** The monthly articles of every town. */
  async articles(): Promise<KilkisArticle[]> {
    return parseKilkisIndex(
      await this.http.text(`${this.origin}/efimeries`, { accept: 'text/html' }),
    );
  }

  /** The days of one article's table. */
  async days(article: KilkisArticle): Promise<KilkisDay[]> {
    return parseKilkisDays(
      await this.http.text(`${this.origin}${article.path}`, { accept: 'text/html' }),
    );
  }
}
