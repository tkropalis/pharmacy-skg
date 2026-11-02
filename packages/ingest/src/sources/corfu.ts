/**
 * Reads the duty and members' pages of the Pharmaceutical Association of Corfu, on
 * farmakeu.static.otenet.gr (corfu/parse.ts), a page a second at most. The server leaves out the
 * intermediate certificate, so requests to it carry Let's Encrypt's (sources/lets-encrypt.ts).
 */
import { request } from 'node:https';
import { rootCertificates } from 'node:tls';
import { parseCorfuDuties, parseCorfuMembers } from '../corfu/parse.ts';
import type { CorfuDuties, CorfuPharmacy } from '../corfu/parse.ts';
import { HttpClient, type HttpTransport } from './http.ts';
import { LETS_ENCRYPT_YR } from './lets-encrypt.ts';

export const CORFU_ORIGIN = 'https://farmakeu.static.otenet.gr';

/** A `fetch` for HTTPS GETs that trusts `extra` certificates besides Node's own. */
export function fetchTrusting(extra: readonly string[]): typeof fetch {
  const ca = [...rootCertificates, ...extra];
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, name) => {
        headers[name] = value;
      });
      const req = request(
        url,
        {
          method: init?.method ?? 'GET',
          headers,
          ca,
          ...(init?.signal ? { signal: init.signal } : {}),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () => {
            const responseHeaders = new Headers();
            for (const [name, value] of Object.entries(res.headers)) {
              if (value !== undefined) responseHeaders.set(name, [value].flat().join(', '));
            }
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode ?? 0,
                statusText: res.statusMessage ?? '',
                headers: responseHeaders,
              }),
            );
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
}

export class CorfuClient {
  private readonly http: HttpClient;

  constructor(transport: HttpTransport = {}) {
    this.http = new HttpClient({
      fetch: fetchTrusting(LETS_ENCRYPT_YR),
      ...transport,
      pauseMs: 1000,
    });
  }

  /** Requests made, retries included. */
  get requests(): number {
    return this.http.requests;
  }

  /** Today's duties. */
  async duties(): Promise<CorfuDuties> {
    return parseCorfuDuties(
      await this.http.text(`${CORFU_ORIGIN}/phduties.php`, { accept: 'text/html' }),
    );
  }

  /** Every member of the association. */
  async members(): Promise<CorfuPharmacy[]> {
    return parseCorfuMembers(
      await this.http.text(`${CORFU_ORIGIN}/members.php`, { accept: 'text/html' }),
    );
  }
}
