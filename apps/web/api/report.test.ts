import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './report.ts';
import { el } from '../src/i18n/el.ts';
import { REPORT_TYPES } from '../src/lib/report.ts';

const valid = {
  pharmacy: '2310123456',
  type: 'wrong-hours',
  message: 'Ήταν κλειστό στις 18:00 ενώ έγραφε ανοιχτό.',
  website: '',
  locale: 'el',
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const githubOk = () =>
  new Response(JSON.stringify({ html_url: 'https://github.com/tkropalis/pharmacy-skg/issues/7' }), {
    status: 201,
  });

describe('POST /api/report', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(githubOk()));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    vi.stubEnv('GITHUB_REPO', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function sentIssue(): { url: string; init: RequestInit; payload: Record<string, unknown> } {
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('fetch was not called');
    const init = call[1] ?? {};
    return {
      url: String(call[0]),
      init,
      payload: JSON.parse(String(init.body)) as Record<string, unknown>,
    };
  }

  it('creates a labelled issue in the default repository', async () => {
    const response = await POST(post(valid));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      ok: true,
      issueUrl: 'https://github.com/tkropalis/pharmacy-skg/issues/7',
    });

    const { url, init, payload } = sentIssue();
    expect(url).toBe('https://api.github.com/repos/tkropalis/pharmacy-skg/issues');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
    expect(payload['labels']).toEqual(['report']);
    expect(payload['title']).toBe('Αναφορά: Λάθος ωράριο — 2310123456');
    expect(String(payload['body'])).toContain('> Ήταν κλειστό στις 18:00');
  });

  it('uses GITHUB_REPO when set', async () => {
    vi.stubEnv('GITHUB_REPO', 'someone/fork');
    await POST(post(valid));
    expect(sentIssue().url).toBe('https://api.github.com/repos/someone/fork/issues');
  });

  it('answers 503 without a token, and sends nothing', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const response = await POST(post(valid));
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 for a malformed GITHUB_REPO instead of calling a strange URL', async () => {
    vi.stubEnv('GITHUB_REPO', '../../orgs/x');
    expect((await POST(post(valid))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('silently accepts a filled honeypot and sends nothing', async () => {
    const response = await POST(post({ ...valid, website: 'http://spam.example' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers a filled honeypot with 200 even when the rest is invalid or the token is missing', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const response = await POST(post({ website: 'x', type: 'nonsense' }));
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown type, a missing or too short message, and a message over 1000 characters', async () => {
    for (const bad of [
      { ...valid, type: 'nonsense' },
      { ...valid, message: undefined },
      { ...valid, message: '  \n ' },
      { ...valid, message: 'ab' },
      { ...valid, message: 'x'.repeat(1001) },
      { ...valid, pharmacy: 5 },
    ]) {
      expect((await POST(post(bad))).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts exactly 1000 characters and an empty pharmacy', async () => {
    const response = await POST(post({ ...valid, pharmacy: '', message: 'x'.repeat(1000) }));
    expect(response.status).toBe(201);
    expect(sentIssue().payload['title']).toBe('Αναφορά: Λάθος ωράριο — χωρίς φαρμακείο');
  });

  it('rejects invalid JSON, a wrong content type and an oversized body', async () => {
    expect((await POST(post('{not json'))).status).toBe(400);
    expect((await POST(post(valid, { 'Content-Type': 'text/plain' }))).status).toBe(415);
    const huge = JSON.stringify({ ...valid, message: 'x'.repeat(9000) });
    expect((await POST(post(huge))).status).toBe(413);
  });

  it('refuses cross-site requests', async () => {
    expect((await POST(post(valid, { 'Sec-Fetch-Site': 'cross-site' }))).status).toBe(403);
    expect((await POST(post(valid, { 'Sec-Fetch-Site': 'same-origin' }))).status).toBe(201);
  });

  it('strips control characters and keeps the title on one line', async () => {
    await POST(
      post({
        ...valid,
        pharmacy: 'Φαρμακείο\u0000\nΜαρίας\u0007\r\n',
        message: 'γραμμή 1\u0000\u0008\r\nγραμμή 2\u001b\n\n\n\nγραμμή 3',
      }),
    );
    const { payload } = sentIssue();
    const title = String(payload['title']);
    const body = String(payload['body']);
    expect(title).toBe('Αναφορά: Λάθος ωράριο — Φαρμακείο Μαρίας');
    // eslint-disable-next-line no-control-regex
    expect(body).not.toMatch(/[\u0000-\u0009\u000b-\u001f]/);
    expect(body).toContain('> γραμμή 1\n> γραμμή 2\n> \n> γραμμή 3');
  });

  it('defuses @mentions so a public report cannot ping anyone', async () => {
    await POST(post({ ...valid, pharmacy: '@octocat', message: 'cc @org/team please' }));
    const { payload } = sentIssue();
    expect(String(payload['title'])).not.toMatch(/@[A-Za-z]/);
    expect(String(payload['body'])).not.toMatch(/@[A-Za-z]/);
  });

  it('answers 502 when GitHub fails or is unreachable, without logging the report', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('nope', { status: 403 })));
    expect((await POST(post(valid))).status).toBe(502);
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    expect((await POST(post(valid))).status).toBe(502);

    const logged = JSON.stringify([
      ...vi.mocked(console.error).mock.calls,
      ...vi.mocked(console.log).mock.calls,
    ]);
    expect(logged).not.toContain(valid.message);
    expect(logged).not.toContain(valid.pharmacy);
  });

  it('knows the same problem types as the form', () => {
    // The function is self-contained, so its list is repeated; this keeps the copies equal.
    expect(Object.keys(el.report.form.typeOptions).sort()).toEqual([...REPORT_TYPES].sort());
  });
});
