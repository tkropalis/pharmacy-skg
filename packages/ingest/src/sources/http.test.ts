import { describe, expect, it } from 'vitest';
import { HttpClient, USER_AGENT, describeError, describeResponse } from './http.ts';

describe('describeError', () => {
  it('adds what fetch puts only in the cause', () => {
    const error = new TypeError('fetch failed', {
      cause: new Error('getaddrinfo ENOTFOUND fsa.gr'),
    });
    expect(describeError(error)).toBe(
      'TypeError: fetch failed: Error: getaddrinfo ENOTFOUND fsa.gr',
    );
  });

  it('leaves an error without a cause as it prints', () => {
    expect(describeError(new Error('HTTP 421 for https://www.moh.gov.gr/'))).toBe(
      'Error: HTTP 421 for https://www.moh.gov.gr/',
    );
    expect(describeError('plain')).toBe('plain');
  });
});

describe('describeResponse', () => {
  it('says the status, who answered and the start of the page, on one line', async () => {
    const response = new Response(
      '<html>\n<head><title>421 Misdirected Request</title></head>\n<body>\n  <h1>Misdirected   Request</h1>\n</body></html>',
      {
        status: 421,
        statusText: 'Misdirected Request',
        headers: {
          server: 'cloudflare',
          via: '1.1 varnish',
          'cf-ray': '9a1b2c3d4e5f-ATH',
          'x-cache': 'MISS',
          'x-served-by': 'cache-ath1234',
          'content-type': 'text/html',
        },
      },
    );
    const text = await describeResponse(response, 'https://www.moh.gov.gr/articles/x');
    expect(text).toBe(
      'HTTP 421 Misdirected Request for https://www.moh.gov.gr/articles/x ' +
        '(server: cloudflare; via: 1.1 varnish; cf-ray: 9a1b2c3d4e5f-ATH; x-cache: MISS; ' +
        'x-served-by: cache-ath1234): 421 Misdirected Request Misdirected Request',
    );
    expect(text).not.toMatch(/\n/);
  });

  it('cuts a long body and leaves out what is not there', async () => {
    const response = new Response('x'.repeat(500), { status: 403 });
    const text = await describeResponse(response, 'https://example.gr/');
    expect(text).toBe(`HTTP 403 for https://example.gr/: ${'x'.repeat(200)}…`);
    const empty = await describeResponse(new Response(null, { status: 502 }), 'https://a.gr/');
    expect(empty).toBe('HTTP 502 for https://a.gr/');
  });

  it('drops scripts and styles from the body', async () => {
    const response = new Response(
      '<style>body { color: red }</style><script>var x = 1;</script><p>Access denied</p>',
      { status: 403, statusText: 'Forbidden' },
    );
    expect(await describeResponse(response, 'https://a.gr/')).toBe(
      'HTTP 403 Forbidden for https://a.gr/: Access denied',
    );
  });
});

/** A client whose requests are answered in turn, and whose waiting is recorded, not done. */
function fake(
  answers: (Response | Error)[],
  options: ConstructorParameters<typeof HttpClient>[0] = {},
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const client = new HttpClient({
    ...options,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      const answer = answers.shift();
      if (!answer) throw new Error('no answer left');
      if (answer instanceof Error) throw answer;
      return answer;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
  });
  return { client, calls, sleeps, advance: (ms: number) => (clock += ms) };
}

describe('HttpClient', () => {
  it('sends the project User-Agent and counts the request', async () => {
    const { client, calls } = fake([new Response('{"a":1}')]);
    expect(await client.json('https://a.gr/x', { accept: 'application/json' })).toEqual({ a: 1 });
    expect(client.requests).toBe(1);
    expect(calls[0]?.init.headers).toEqual({
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    });
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('posts a form with its content type, and adds the headers it is given per try', async () => {
    let jar = 'a=1';
    const { client, calls } = fake([new Response('ok')], { headers: () => ({ Cookie: jar }) });
    jar = 'a=2';
    const form = new URLSearchParams({ date: '2026-11-02' });
    await client.text('https://a.gr/tomeas', { accept: 'text/html', form });
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe(form);
    expect(calls[0]?.init.headers).toEqual({
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
      Cookie: 'a=2',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  it('shows every response to onResponse, a failed one too', async () => {
    const seen: number[] = [];
    const { client } = fake([new Response('no', { status: 500 }), new Response('yes')], {
      onResponse: (response) => seen.push(response.status),
    });
    expect(await client.text('https://a.gr/')).toBe('yes');
    expect(seen).toEqual([500, 200]);
  });

  it('tries a network error, a 5xx and a 429 again, pausing 4 s and then 8 s', async () => {
    const { client, sleeps } = fake([
      new TypeError('fetch failed'),
      new Response('busy', { status: 429 }),
      new Response('fine'),
    ]);
    expect(await client.text('https://a.gr/')).toBe('fine');
    expect(client.requests).toBe(3);
    expect(sleeps).toEqual([4000, 8000]);

    const gives = fake([
      new Response('', { status: 503 }),
      new Response('', { status: 502 }),
      new Response('down', { status: 500, statusText: 'Internal Server Error' }),
    ]);
    await expect(gives.client.text('https://a.gr/')).rejects.toThrow(
      'HTTP 500 Internal Server Error for https://a.gr/: down',
    );
    expect(gives.client.requests).toBe(3);
  });

  it('gives up at once on any other status, naming what answered', async () => {
    const { client, sleeps } = fake([
      new Response('<h1>Misdirected Request</h1>', {
        status: 421,
        statusText: 'Misdirected Request',
        headers: { server: 'nginx', 'cf-ray': 'abc-ATH' },
      }),
    ]);
    await expect(client.fetch('https://www.moh.gov.gr/x')).rejects.toThrow(
      'HTTP 421 Misdirected Request for https://www.moh.gov.gr/x (server: nginx; cf-ray: abc-ATH): Misdirected Request',
    );
    expect(client.requests).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('tries again a body that fails half-way with text, not with fetch', async () => {
    const broken = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('terminated'));
          },
        }),
      );
    const reading = fake([broken(), new Response('whole')]);
    expect(await reading.client.text('https://a.gr/')).toBe('whole');
    expect(reading.client.requests).toBe(2);

    const raw = fake([broken(), new Response('whole')]);
    const response = await raw.client.fetch('https://a.gr/');
    await expect(response.text()).rejects.toThrow('terminated');
    expect(raw.client.requests).toBe(1);
  });

  it('allows the tries and the pauses it is told to', async () => {
    const { client, sleeps } = fake(
      [new Response('', { status: 500 }), new Response('', { status: 500 })],
      { attempts: 2, backoffMs: () => 60_000 },
    );
    await expect(client.fetch('https://nominatim.example/')).rejects.toThrow('HTTP 500');
    expect(client.requests).toBe(2);
    expect(sleeps).toEqual([60_000]);
  });

  it('starts requests at least pauseMs apart, one at a time', async () => {
    const { client, sleeps, advance } = fake(
      [new Response('1'), new Response('2'), new Response('3')],
      { pauseMs: 1000 },
    );
    expect(await client.text('https://a.gr/1')).toBe('1');
    expect(sleeps).toEqual([]);
    advance(300);
    expect(await client.text('https://a.gr/2')).toBe('2');
    expect(sleeps).toEqual([700]);
    advance(5000);
    expect(await client.text('https://a.gr/3')).toBe('3');
    expect(sleeps).toEqual([700]);
  });

  it('queues requests made together', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const client = new HttpClient({
      pauseMs: 1,
      sleep: async () => undefined,
      fetch: async (url) => {
        order.push(`start ${String(url)}`);
        if (String(url).endsWith('/1')) await gate;
        order.push(`end ${String(url)}`);
        return new Response('x');
      },
    });
    const first = client.text('https://a.gr/1');
    const second = client.text('https://a.gr/2');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual(['start https://a.gr/1']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual([
      'start https://a.gr/1',
      'end https://a.gr/1',
      'start https://a.gr/2',
      'end https://a.gr/2',
    ]);
  });

  it('keeps the queue going after a request failed', async () => {
    const { client } = fake([new Response('', { status: 404 }), new Response('next')], {
      pauseMs: 1,
    });
    const failed = client.text('https://a.gr/1');
    const next = client.text('https://a.gr/2');
    await expect(failed).rejects.toThrow('HTTP 404');
    expect(await next).toBe('next');
  });
});
