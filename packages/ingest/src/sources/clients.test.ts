import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FsaClient } from './fsa.ts';
import { USER_AGENT } from './http.ts';
import { IteqClient } from './iteq.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

/** Answers each request in turn and records it; waits are recorded, not made. */
function transport(answers: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  return {
    calls,
    sleeps,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const answer = answers.shift();
      if (!answer) throw new Error('no answer left');
      return answer;
    },
    sleep: async (ms: number) => void sleeps.push(ms),
  };
}

describe('IteqClient', () => {
  it('keeps the cookies and the form token between requests', async () => {
    const home = new Response(fixture('iteq/larisa_2026-10-06_home.html'), {
      headers: [
        ['set-cookie', '.AspNetCore.Antiforgery.x=abc; path=/; samesite=strict; httponly'],
        ['set-cookie', 'lang=el; path=/'],
      ],
    });
    const next = new Response(fixture('iteq/larisa_2026-10-10.html'));
    const t = transport([home, next]);
    const client = new IteqClient('larisa.efhmeries.gr', t);

    const page = await client.home();
    expect(page.date).toBe('2026-10-06');
    await client.day('2026-10-10');

    expect(client.requests).toBe(2);
    const [first, second] = t.calls;
    expect(first?.url).toBe('https://larisa.efhmeries.gr/');
    expect(first?.init.method).toBe('GET');
    expect(first?.init.headers).toEqual({ 'User-Agent': USER_AGENT, Accept: 'text/html' });
    expect(second?.url).toBe('https://larisa.efhmeries.gr/tomeas');
    expect(second?.init.method).toBe('POST');
    expect(second?.init.headers).toEqual({
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
      Cookie: '.AspNetCore.Antiforgery.x=abc; lang=el',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const form = second?.init.body as URLSearchParams;
    expect(form.get('date')).toBe('2026-10-10');
    expect(form.get('tomeas')).toBe('');
    expect(form.get('__RequestVerificationToken')).toBe(page.token);
  });

  it('waits before a second request that comes too soon, and counts the retries', async () => {
    const t = transport([
      new Response('', { status: 503 }),
      new Response(fixture('iteq/larisa_details_23023.html')),
    ]);
    const client = new IteqClient('larisa.efhmeries.gr', t);
    expect(await client.details('23023')).not.toBeNull();
    expect(client.requests).toBe(2);
    expect(t.sleeps).toEqual([4000]);
    expect(t.calls[1]?.url).toBe('https://larisa.efhmeries.gr/Home/Details/23023');
  });

  it('needs the home page first', async () => {
    const client = new IteqClient('larisa.efhmeries.gr', transport([]));
    await expect(client.day('2026-10-10')).rejects.toThrow('no form token');
    expect(client.requests).toBe(0);
  });
});

describe('FsaClient', () => {
  it('reads the dates, then posts the form for a day', async () => {
    const t = transport([
      new Response(fixture('fsa/home_2026-10-08.html')),
      new Response(fixture('fsa/2026-10-08.html')),
    ]);
    const client = new FsaClient(t);
    const dates = await client.dates();
    expect(dates).toHaveLength(201);
    const cards = await client.day('2026-10-08');
    expect(cards.length).toBeGreaterThan(0);
    expect(client.requests).toBe(2);

    const post = t.calls[1];
    expect(post?.url).toBe('https://fsa-efimeries.gr/Home/FilteredHomeResults');
    expect(post?.init.method).toBe('POST');
    expect(post?.init.headers).toEqual({
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(String(post?.init.body)).toBe('Date=2026-10-08&IsOpen=false');
  });

  it('fails with what the site answered', async () => {
    const t = transport([
      new Response('Forbidden by firewall', {
        status: 403,
        statusText: 'Forbidden',
        headers: { server: 'Apache' },
      }),
    ]);
    await expect(new FsaClient(t).dates()).rejects.toThrow(
      'HTTP 403 Forbidden for https://fsa-efimeries.gr/ (server: Apache): Forbidden by firewall',
    );
  });
});
