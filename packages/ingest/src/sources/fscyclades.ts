/**
 * Reads the Cyclades association's duty page (`fscyclades.gr/onduty-cyclades/`,
 * cyclades/parse.ts) the way its form does: the page itself for the places on offer, then one
 * post for each date and place. One request at a time, at most one a second; no token or bot
 * challenge is involved.
 */
import {
  parseCycladesPlaces,
  parseCycladesResult,
  type CycladesResult,
} from '../cyclades/parse.ts';
import { HttpClient, type HttpTransport } from './http.ts';

const PAUSE_MS = 1000;

export class CycladesClient {
  readonly origin = 'https://www.fscyclades.gr';
  readonly page = `${this.origin}/onduty-cyclades/`;
  private readonly http: HttpClient;

  /** `transport` is what a test replaces: the network and the clock. */
  constructor(transport: HttpTransport = {}) {
    this.http = new HttpClient({ ...transport, pauseMs: PAUSE_MS });
  }

  /** Requests made, retries included. */
  get requests(): number {
    return this.http.requests;
  }

  /** The places the form offers ("Τήνος (Χώρα)"). */
  async places(): Promise<string[]> {
    return parseCycladesPlaces(await this.http.text(this.page, { accept: 'text/html' }));
  }

  /** The pharmacy on duty in one place on one day (YYYY-MM-DD); none when the place has none. */
  async day(date: string, place: string): Promise<CycladesResult> {
    const form = new URLSearchParams({ selected_date: date, selected_location: place });
    return parseCycladesResult(await this.http.text(this.page, { accept: 'text/html', form }));
  }
}
