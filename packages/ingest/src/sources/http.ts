// Identifies the project to the sites it reads from. pkm.gov.gr rejects
// requests without a browser-like User-Agent, hence the Mozilla prefix.
export const USER_AGENT =
  'Mozilla/5.0 (compatible; pharmacy-skg/0.1; +https://github.com/tkropalis/pharmacy-skg)';

/**
 * An error with what caused it: fetch reports a site it cannot reach as "TypeError: fetch failed"
 * and puts the reason (DNS, refused, reset, timeout) only in `cause`.
 */
export function describeError(error: unknown): string {
  const parts = [String(error)];
  let cause = (error as { cause?: unknown } | null)?.cause;
  for (let depth = 0; cause && depth < 3; depth++) {
    parts.push(String(cause));
    cause = (cause as { cause?: unknown }).cause;
  }
  return parts.join(': ');
}

/**
 * The response headers that say who answered, and so why a request was refused: the server, the
 * proxies on the way and the CDNs' markers. Lowercase, in the order they are printed.
 */
const DIAGNOSTIC_HEADERS = [
  'server',
  'via',
  'cf-ray',
  'cf-mitigated',
  'x-cache',
  'x-served-by',
  'x-amz-cf-pop',
  'akamai-grn',
  'x-azure-ref',
  'x-sucuri-id',
  'x-iinfo',
  'retry-after',
] as const;

const HEADER_CHARS = 100;
const BODY_CHARS = 200;

/** One line of at most `max` characters: markup dropped, runs of white space made single. */
function oneLine(text: string, max: number): string {
  const plain = text
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

/**
 * What a response that is not OK says, on one line: its status, who answered and the start of
 * its body. www.moh.gov.gr answered GitHub's runners with HTTP 421 from 22 Oct 2026 (from
 * Greece it answered 200); the status alone did not say whether a CDN, a firewall or the site
 * itself refused.
 *
 *   HTTP 421 Misdirected Request for https://www.moh.gov.gr/x (server: nginx; via: 1.1 google): …
 */
export async function describeResponse(response: Response, url: string): Promise<string> {
  const headers = DIAGNOSTIC_HEADERS.flatMap((name) => {
    const value = response.headers.get(name);
    const text = value === null ? '' : oneLine(value, HEADER_CHARS);
    return text ? [`${name}: ${text}`] : [];
  });
  let body = '';
  try {
    body = oneLine(await response.text(), BODY_CHARS);
  } catch {
    // The body is a courtesy; the status already says what happened.
  }
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
  return (
    `${status} for ${url}` +
    (headers.length > 0 ? ` (${headers.join('; ')})` : '') +
    (body ? `: ${body}` : '')
  );
}

/**
 * A site that answered with a bot challenge (Cloudflare's `cf-mitigated: challenge`). It refuses
 * the network the run is on, not the request: efimeria.gr has answered GitHub's runners so since
 * 2 Nov 2026 and fscyclades.gr since 5 Nov, while both answer 200 from Greece. Asking again does
 * not help, and getting past a challenge is not ours to do (CLAUDE.md), so it is not retried.
 */
export class BlockedError extends Error {
  override readonly name = 'BlockedError';
}

/** Whether an error, or one it was caused by, is a bot challenge (`BlockedError`). */
export function isBlocked(error: unknown): boolean {
  let current = error;
  for (let depth = 0; current && depth < 4; depth++) {
    if (current instanceof BlockedError) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export interface HttpClientOptions {
  /**
   * The least time between the starts of two requests, and with it one request at a time. A site
   * run by a small association gets one a second (ITeQ's, ΦΣΑ's), Nominatim's policy asks for it.
   * Default 0: no pause, requests may overlap.
   */
  readonly pauseMs?: number;
  /** Tries per request, the first included. Default 3. */
  readonly attempts?: number;
  /** Time allowed for one try, the body not included. Default 60 s. */
  readonly timeoutMs?: number;
  /** Time before the retry after try `attempt` (1 for the first retry). Default 2 s · 2^attempt. */
  readonly backoffMs?: (attempt: number) => number;
  /** Headers for each try, computed afresh (a cookie jar changes between tries). */
  readonly headers?: () => Record<string, string>;
  /** Sees every response before its status is looked at (to keep its cookies). */
  readonly onResponse?: (response: Response) => void;
  /** For tests. */
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/** What a test replaces: the network and the clock. */
export type HttpTransport = Pick<HttpClientOptions, 'fetch' | 'sleep' | 'now'>;

export interface HttpRequest {
  readonly accept?: string;
  readonly headers?: Record<string, string>;
  /** A form to POST (urlencoded); a GET without it. */
  readonly form?: URLSearchParams;
}

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The one way the pipeline reads a site: the project's User-Agent, a timeout, up to three tries
 * with a growing pause between them, and a count of the tries made (`requests`, which the logs
 * report). Only a failure that may pass is tried again: a network error, a 5xx or a 429. Any
 * other status (a 404, the 421 above) fails at once with `describeResponse`. A client with a
 * `pauseMs` is for one host: it lets one request through at a time and starts each at least
 * `pauseMs` after the one before.
 */
export class HttpClient {
  /** Tries made so far, retries included. */
  requests = 0;

  private lastStart = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly pauseMs: number;
  private readonly attempts: number;
  private readonly timeoutMs: number;
  private readonly backoffMs: (attempt: number) => number;
  private readonly headers: () => Record<string, string>;
  private readonly onResponse: (response: Response) => void;
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: HttpClientOptions = {}) {
    this.pauseMs = options.pauseMs ?? 0;
    this.attempts = options.attempts ?? 3;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.backoffMs = options.backoffMs ?? ((attempt) => 2000 * 2 ** attempt);
    this.headers = options.headers ?? (() => ({}));
    this.onResponse = options.onResponse ?? (() => undefined);
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? sleepFor;
    this.now = options.now ?? Date.now;
  }

  /**
   * The response to a request that succeeded. Its body is still to read: a body that fails
   * half-way is not tried again (use `text` for that).
   */
  fetch(url: string, request: HttpRequest = {}): Promise<Response> {
    return this.schedule(url, request, async (response) => response);
  }

  /** The body of a successful response as text; a body that fails half-way is tried again. */
  text(url: string, request: HttpRequest = {}): Promise<string> {
    return this.schedule(url, request, (response) => response.text());
  }

  /** The body of a successful response as JSON; a body that fails half-way is tried again. */
  json(url: string, request: HttpRequest = {}): Promise<unknown> {
    return this.schedule(url, request, (response) => response.json() as Promise<unknown>);
  }

  private schedule<T>(
    url: string,
    request: HttpRequest,
    read: (response: Response) => Promise<T>,
  ): Promise<T> {
    if (this.pauseMs <= 0) return this.run(url, request, read);
    const result = this.queue.then(async () => {
      const wait = this.lastStart + this.pauseMs - this.now();
      if (wait > 0) await this.sleep(wait);
      return this.run(url, request, read);
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async run<T>(
    url: string,
    request: HttpRequest,
    read: (response: Response) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      if (attempt > 0) await this.sleep(this.backoffMs(attempt));
      this.lastStart = this.now();
      this.requests++;
      try {
        const response = await this.doFetch(url, {
          method: request.form ? 'POST' : 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            ...(request.accept ? { Accept: request.accept } : {}),
            ...this.headers(),
            ...(request.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...request.headers,
          },
          ...(request.form ? { body: request.form } : {}),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        this.onResponse(response);
        if (response.ok) return await read(response);
        if (response.headers.get('cf-mitigated') === 'challenge') {
          lastError = new BlockedError(await describeResponse(response, url));
          break;
        }
        lastError = new Error(await describeResponse(response, url));
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}

/** For the sites that need no pause: one client, so its count covers every such request. */
const plain = new HttpClient();

export async function getJson(url: string): Promise<unknown> {
  return (await plain.fetch(url, { accept: 'application/json' })).json();
}

export async function getText(url: string): Promise<string> {
  return (await plain.fetch(url, { accept: 'text/html' })).text();
}

export async function getBytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await plain.fetch(url, { accept: '*/*' })).arrayBuffer());
}
