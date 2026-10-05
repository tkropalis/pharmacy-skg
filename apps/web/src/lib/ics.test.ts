import { describe, expect, it } from 'vitest';
import { buildIcs, dutyEvents, escapeText, foldLine, utcStamp } from './ics.ts';
import type { IcsTexts } from './ics.ts';

const texts: IcsTexts = {
  summary: 'Εφημερία: {name}',
  source: 'Πηγή: ΦΣΘ',
  callFirst: 'Καλέστε πριν πάτε.',
  calendarName: 'Εφημερίες',
};
const pharmacy = {
  id: '2310023026',
  name: 'ΚΟΥΡΤΙΔΗΣ ΓΕΩΡΓΙΟΣ & ΣΙΑ Ο.Ε.',
  address: 'ΠΑΥΛΟΥ ΜΕΛΑ 22',
  locality: 'Πυλαία',
  phone: '2310023026',
};
const duty = (date: string, hours: { from: string; to: string; toNextDay: boolean } | null) => ({
  date,
  groupId: 'metro',
  duty: 'overnight' as const,
  heading: 'ΔΙΑΝΥΚΤΕΡΕΥΟΝΤΑ, από 22:00 έως 08:00',
  hours,
});
const now = new Date('2026-10-05T10:00:00Z');

describe('escapeText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a,b;c\\d\ne\r\nf')).toBe('a\\,b\;c\\\\d\\ne\\nf');
  });
});

describe('foldLine', () => {
  const octets = (s: string) => new TextEncoder().encode(s).length;

  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });
  it('folds ASCII at 75 octets with CRLF + space', () => {
    const folded = foldLine(`DESCRIPTION:${'x'.repeat(200)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((l) => octets(l) <= 75)).toBe(true);
    expect(lines[0]).toHaveLength(75);
    expect(lines.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(
      `DESCRIPTION:${'x'.repeat(200)}`,
    );
  });
  it('never splits a multi-byte character and counts octets, not characters', () => {
    const line = `SUMMARY:${'Εφημερία '.repeat(20)}`;
    const folded = foldLine(line);
    const lines = folded.split('\r\n');
    expect(lines.every((l) => octets(l) <= 75)).toBe(true);
    const unfolded = lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('');
    expect(unfolded).toBe(line);
    expect(unfolded).not.toContain('�');
  });
});

describe('utcStamp', () => {
  it('formats UTC basic format', () => {
    expect(utcStamp(new Date('2026-10-24T19:00:00Z'))).toBe('20261024T190000Z');
  });
});

describe('dutyEvents', () => {
  it('converts the printed hours to UTC across the 25 Oct 2026 DST change', () => {
    // Athens falls back at 04:00 EEST on Sunday 25 Oct: UTC+3 before, UTC+2 after.
    const [saturday, sunday] = dutyEvents(
      pharmacy,
      [
        duty('2026-10-24', { from: '22:00', to: '08:00', toNextDay: true }),
        duty('2026-10-25', { from: '22:00', to: '08:00', toNextDay: true }),
      ],
      texts,
      'Europe/Athens',
    );
    expect(saturday?.when).toEqual({
      kind: 'instants',
      start: new Date('2026-10-24T19:00:00Z'), // 22:00 EEST
      end: new Date('2026-10-25T06:00:00Z'), // 08:00 EET, an hour later in UTC than +3 would give
    });
    expect(sunday?.when).toEqual({
      kind: 'instants',
      start: new Date('2026-10-25T20:00:00Z'), // 22:00 EET
      end: new Date('2026-10-26T06:00:00Z'),
    });
  });

  it('makes an all-day event when no hours are printed', () => {
    const [event] = dutyEvents(pharmacy, [duty('2026-10-05', null)], texts, 'Europe/Athens');
    expect(event?.when).toEqual({ kind: 'day', date: '2026-10-05' });
  });

  it('builds the summary, location, description and a stable UID', () => {
    const [event] = dutyEvents(pharmacy, [duty('2026-10-05', null)], texts, 'Europe/Athens');
    expect(event?.summary).toBe('Εφημερία: ΚΟΥΡΤΙΔΗΣ ΓΕΩΡΓΙΟΣ & ΣΙΑ Ο.Ε.');
    expect(event?.location).toBe('ΠΑΥΛΟΥ ΜΕΛΑ 22, Πυλαία');
    expect(event?.description).toContain('ΔΙΑΝΥΚΤΕΡΕΥΟΝΤΑ');
    expect(event?.description).toContain('Πηγή: ΦΣΘ');
    expect(event?.uid).toBe('2310023026-2026-10-05-overnight-metro@pharmacy-skg');
  });
});

describe('buildIcs', () => {
  const events = dutyEvents(
    pharmacy,
    [
      duty('2026-10-24', { from: '22:00', to: '08:00', toNextDay: true }),
      duty('2026-10-27', null),
    ],
    texts,
    'Europe/Athens',
  );
  const text = buildIcs(events, now, texts.calendarName);

  it('uses CRLF everywhere and ends with one', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });
  it('wraps events in a VCALENDAR with DTSTAMP and UTC times', () => {
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text).toContain('DTSTAMP:20261005T100000Z');
    expect(text).toContain('DTSTART:20261024T190000Z');
    expect(text).toContain('DTEND:20261025T060000Z');
    expect(text).toContain('DTSTART;VALUE=DATE:20261027');
    expect(text).toContain('DTEND;VALUE=DATE:20261028');
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(text.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
  it('escapes text and folds long lines', () => {
    expect(text).toContain('DESCRIPTION:ΔΙΑΝΥΚΤΕΡΕΥΟΝΤΑ\\, από 22:00 έως 08:00');
    const unfolded = text.replace(/\r\n /g, '');
    expect(unfolded).toContain('SUMMARY:Εφημερία: ΚΟΥΡΤΙΔΗΣ ΓΕΩΡΓΙΟΣ & ΣΙΑ Ο.Ε.');
    for (const line of text.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});
