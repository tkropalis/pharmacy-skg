// Identifies the project to the sites it reads from. pkm.gov.gr rejects
// requests without a browser-like User-Agent, hence the Mozilla prefix.
export const USER_AGENT =
  'Mozilla/5.0 (compatible; pharmacy-skg/0.1; +https://github.com/tkropalis/pharmacy-skg)';

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
