/**
 * POST /api/report: turns a problem report from the app into a public GitHub issue
 * (decision D17). A Vercel serverless function (Node runtime, Web-standard handler).
 *
 * Environment:
 *   GITHUB_TOKEN  fine-grained token with Issues read/write on the one repository (required;
 *                 without it the function answers 503 and the form links to GitHub instead)
 *   GITHUB_REPO   "owner/name", default tkropalis/pharmacy-skg
 *
 * Self-contained on purpose (no imports from src/): Vercel bundles api/ on its own.
 * The message is public the moment it is posted, and is never logged here.
 */
import { z } from 'zod';

const DEFAULT_REPO = 'tkropalis/pharmacy-skg';
const MAX_BODY_BYTES = 8 * 1024;
const MESSAGE_MAX = 1000;
const MESSAGE_MIN = 3;
const PHARMACY_MAX = 120;
const TITLE_MAX = 200;
const GITHUB_TIMEOUT_MS = 8000;
/** A pharmacy id as the registry prints it, or a generated one (x- and ten hex digits). */
const PHARMACY_ID = /^(\d{10}|x-[0-9a-f]{10})$/;
/** Only `application/json`, optionally with a charset: nothing else is a JSON request. */
const JSON_CONTENT_TYPE = /^application\/json\s*(;\s*charset=["']?[\w-]+["']?\s*)?$/i;

// Best-effort limit per client: a Map in this function instance's memory. Instances come and go
// and do not share it, so it only slows down a careless loop. The real limit is a Vercel
// Firewall rate-limit rule for /api/report (apps/web/README.md).
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX_CLIENTS = 2000;
const recent = new Map<string, number[]>();

/** Forgets everything the limiter knows (tests). */
export function resetRateLimit(): void {
  recent.clear();
}

/** The first address of X-Forwarded-For (Vercel sets it), or 'unknown'. */
function clientOf(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]?.trim().slice(0, 64) || 'unknown';
}

/** Counts a request; false when the client is over the limit. */
function allowed(client: string, now: number): boolean {
  const times = (recent.get(client) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT) {
    recent.set(client, times);
    return false;
  }
  times.push(now);
  recent.delete(client);
  recent.set(client, times);
  // Bounded memory: drop the oldest clients first.
  while (recent.size > RATE_MAX_CLIENTS) {
    const oldest = recent.keys().next();
    if (oldest.done) break;
    recent.delete(oldest.value);
  }
  return true;
}

/** Issue titles are in Greek: that is the language of the people who triage them. */
const TYPE_LABELS = {
  'wrong-hours': 'Λάθος ωράριο',
  'closed-but-listed-open': 'Κλειστό ενώ εμφανιζόταν ανοιχτό',
  'wrong-location': 'Λάθος θέση',
  'wrong-phone': 'Λάθος τηλέφωνο',
  other: 'Άλλο',
} as const;
const TYPE_IDS = Object.keys(TYPE_LABELS) as [
  keyof typeof TYPE_LABELS,
  ...(keyof typeof TYPE_LABELS)[],
];

const reportSchema = z.object({
  pharmacy: z
    .string()
    .max(PHARMACY_MAX * 4)
    .optional(),
  type: z.enum(TYPE_IDS),
  message: z.string().max(MESSAGE_MAX),
  locale: z.enum(['el', 'en']).optional(),
});

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Control characters, plus the Unicode line and paragraph separators.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
// The same, except newline (\n) and tab (\t), which a multi-line message may keep.
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g;

/** One line: control characters and runs of whitespace become single spaces. */
function singleLine(value: string): string {
  return value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

/** Multi-line text: control characters other than newline and tab are removed. */
function multiLine(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_EXCEPT_NEWLINE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Text between fences that no line of it can close: the fence is one backtick longer than the
 * longest run of backticks inside. In a code block GitHub shows the text as it is, with no
 * links, images, HTML, @mentions or owner/repo#1 references.
 */
export function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!JSON_CONTENT_TYPE.test((request.headers.get('content-type') ?? '').trim())) {
    return json({ ok: false, error: 'unsupported-media-type' }, 415);
  }
  // Browsers state where a request comes from; refuse other sites' forms and scripts.
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  if (!allowed(clientOf(request), Date.now())) {
    return json({ ok: false, error: 'rate-limited' }, 429);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'too-large' }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }

  // Honeypot: a person never fills the hidden field. Answer as if it worked, send nothing.
  if (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { website?: unknown }).website === 'string' &&
    (payload as { website: string }).website.trim() !== ''
  ) {
    return json({ ok: true }, 200);
  }

  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) return json({ ok: false, error: 'invalid' }, 400);

  const typed = singleLine(parsed.data.pharmacy ?? '').slice(0, PHARMACY_MAX);
  // Only a registry id goes into the title and the plain text; anything else the person typed
  // goes into the code block with the message.
  const pharmacyId = PHARMACY_ID.test(typed) ? typed : '';
  const message = multiLine(parsed.data.message);
  if (message.length < MESSAGE_MIN) return json({ ok: false, error: 'invalid' }, 400);

  const token = process.env['GITHUB_TOKEN'];
  if (!token) return json({ ok: false, error: 'unavailable' }, 503);
  const repo = process.env['GITHUB_REPO'] || DEFAULT_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return json({ ok: false, error: 'unavailable' }, 503);

  const typeLabel = TYPE_LABELS[parsed.data.type];
  const title = `Αναφορά: ${typeLabel} — ${pharmacyId || 'χωρίς φαρμακείο'}`.slice(0, TITLE_MAX);
  const freeText = [typed !== '' && pharmacyId === '' ? `Φαρμακείο: ${typed}` : '', message]
    .filter((part) => part !== '')
    .join('\n\n');
  const body = [
    `**Τύπος:** ${typeLabel}`,
    `**Φαρμακείο:** ${pharmacyId || '—'}`,
    `**Γλώσσα:** ${parsed.data.locale ?? '—'}`,
    '',
    fenced(freeText),
    '',
    '---',
    '_Στάλθηκε από τη φόρμα αναφοράς της εφαρμογής._',
  ].join('\n');

  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'pharmacy-skg-report',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body, labels: ['report'] }),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
  } catch {
    console.error('report: GitHub request failed');
    return json({ ok: false, error: 'upstream' }, 502);
  }

  if (response.status !== 201) {
    // Status only: never the report, never GitHub's reply.
    console.error(`report: GitHub answered ${response.status}`);
    return json({ ok: false, error: 'upstream' }, 502);
  }

  const created: unknown = await response.json().catch(() => null);
  const issueUrl =
    typeof created === 'object' && created !== null && 'html_url' in created
      ? String((created as { html_url: unknown }).html_url)
      : undefined;
  return json({ ok: true, issueUrl }, 201);
}
