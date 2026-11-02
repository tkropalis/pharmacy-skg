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

async function request(url: string, accept: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} for ${url}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function getJson(url: string): Promise<unknown> {
  return (await request(url, 'application/json')).json();
}

export async function getText(url: string): Promise<string> {
  return (await request(url, 'text/html')).text();
}

export async function getBytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await request(url, '*/*')).arrayBuffer());
}
