import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, fenced, resetRateLimit } from './report.ts';
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
    resetRateLimit();
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
    expect(payload['title']).toBe('Αναφορά: Λάθος ωράριο, 2310123456');
    expect(String(payload['body'])).toContain('```\nΉταν κλειστό στις 18:00');
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
      resetRateLimit(); // this test sends more than the limit allows
      expect((await POST(post(bad))).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts exactly 1000 characters and an empty pharmacy', async () => {
    const response = await POST(post({ ...valid, pharmacy: '', message: 'x'.repeat(1000) }));
    expect(response.status).toBe(201);
    expect(sentIssue().payload['title']).toBe('Αναφορά: Λάθος ωράριο, χωρίς φαρμακείο');
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
    // The typed name is not a registry id: it goes into the code block, not the title.
    expect(title).toBe('Αναφορά: Λάθος ωράριο, χωρίς φαρμακείο');
    // eslint-disable-next-line no-control-regex
    expect(body).not.toMatch(/[\u0000-\u0009\u000b-\u001f]/);
    expect(body).toContain(
      '```\nΦαρμακείο: Φαρμακείο Μαρίας\n\nγραμμή 1\nγραμμή 2\n\nγραμμή 3\n```',
    );
  });

  it('removes bidi overrides and zero-width characters from the message and the pharmacy', async () => {
    const hidden = [
      '\u200b',
      '\u200c',
      '\u200d',
      '\u200e',
      '\u200f',
      '\u202a',
      '\u202b',
      '\u202c',
      '\u202d',
      '\u202e',
      '\u2066',
      '\u2067',
      '\u2068',
      '\u2069',
      '\ufeff',
    ];
    const mixed = (text: string) =>
      hidden.join('') + text.split('').join(hidden[0]) + hidden.join('');
    await POST(
      post({
        ...valid,
        pharmacy: mixed('Φαρμακείο Μαρίας'),
        message: `${mixed('κλειστό')}\n${hidden.join('')}δεύτερη γραμμή`,
      }),
    );
    const body = String(sentIssue().payload['body']);
    for (const char of hidden) expect(body).not.toContain(char);
    expect(body).toContain('Φαρμακείο: Φαρμακείο Μαρίας');
    expect(body).toContain('κλειστό\nδεύτερη γραμμή');
  });

  it('puts the message in a fence longer than any backtick run in it', async () => {
    const message = 'before ``` # closes? ````` after\n```\n![x](http://evil.example/a.png)';
    await POST(post({ ...valid, message }));
    const body = String(sentIssue().payload['body']);
    const fence = '``````'; // six: one more than the longest run (five)
    expect(body).toContain(`${fence}\n${message}\n${fence}`);
    expect(fenced('a')).toBe('```\na\n```');
    expect(fenced('a ```` b')).toBe('`````\na ```` b\n`````');
  });

  it('keeps links, HTML, mentions and issue references of the message out of the plain text', async () => {
    await POST(
      post({
        ...valid,
        pharmacy: '<img src=x onerror=1> @octocat owner/repo#1',
        message: '[click](http://evil.example) <b>x</b> @org/team other/repo#2',
      }),
    );
    const { payload } = sentIssue();
    const body = String(payload['body']);
    const outside = body.replace(/(`{3,})\n[\s\S]*?\n\1/, '');
    expect(String(payload['title'])).not.toMatch(/[<>@#[\]]/);
    for (const text of ['evil.example', '<b>', '@org', '@octocat', 'other/repo#2', '<img']) {
      expect(outside).not.toContain(text);
      expect(String(payload['title'])).not.toContain(text);
    }
    expect(body).toContain('[click](http://evil.example)');
  });

  it('accepts only a registry or generated id as the pharmacy', async () => {
    await POST(post({ ...valid, pharmacy: 'x-0123456789' }));
    expect(String(sentIssue().payload['title'])).toBe('Αναφορά: Λάθος ωράριο, x-0123456789');
    fetchMock.mockClear();
    await POST(post({ ...valid, pharmacy: '2310123456 evil' }));
    expect(String(sentIssue().payload['title'])).toContain('χωρίς φαρμακείο');
  });

  it('compares the content type exactly', async () => {
    const ok = [
      'application/json',
      'application/json; charset=utf-8',
      'Application/JSON;charset=UTF-8',
    ];
    for (const type of ok) {
      expect(
        (await POST(post(valid, { 'Content-Type': type, 'X-Forwarded-For': type }))).status,
      ).toBe(201);
    }
    for (const type of [
      'text/plain; application/json',
      'application/jsonp',
      'application/json5',
      'x/application/json',
      'application/json; boundary=x',
      '',
    ]) {
      expect((await POST(post(valid, { 'Content-Type': type }))).status, type).toBe(415);
    }
  });

  it('limits a client to 5 reports in 10 minutes, per first forwarded address', async () => {
    const from = (ip: string) => post(valid, { 'X-Forwarded-For': `${ip}, 10.0.0.1` });
    for (let i = 0; i < 5; i++) expect((await POST(from('203.0.113.7'))).status).toBe(201);
    const limited = await POST(from('203.0.113.7'));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: 'rate-limited' });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    // Another client is not affected.
    expect((await POST(from('203.0.113.8'))).status).toBe(201);
    // After the window the first client may send again.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 10 * 60_000 + 1000);
    expect((await POST(from('203.0.113.7'))).status).toBe(201);
    vi.useRealTimers();
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
