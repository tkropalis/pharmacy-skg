import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { extractTextItems } from '../pdf.ts';
import { required } from '../required.ts';
import { AREA_GROUPS } from './groups.ts';
import { parseDutyList, parseTitleDate, type DutyList } from './parse.ts';

const FIXTURES = new URL('../../fixtures/fsth/', import.meta.url);

async function parseFixture(name: string): Promise<DutyList> {
  const data = new Uint8Array(await readFile(new URL(name, FIXTURES)));
  return parseDutyList(await extractTextItems(data));
}

function summary(list: DutyList): string[] {
  return list.sections.map((section) => {
    const hours = section.hours
      ? `${section.hours.from}-${section.hours.to}${section.hours.toNextDay ? '+1' : ''}`
      : '?';
    return `${section.kind} ${hours} ×${section.entries.length}`;
  });
}

describe('parseTitleDate', () => {
  it('reads the Greek date and checks the weekday', () => {
    expect(parseTitleDate('Εφημερεύοντα Φαρμακεία Σάββατο 03 Οκτ 2026')).toBe('2026-10-03');
    expect(parseTitleDate('Εφημερεύοντα Φαρμακεία Τετάρτη 15 Ιουλ 2026')).toBe('2026-07-15');
    expect(parseTitleDate('Εφημερεύοντα Φαρμακεία Δευτέρα 23 Φεβ 2026')).toBe('2026-02-23');
    expect(() => parseTitleDate('Εφημερεύοντα Φαρμακεία Κυριακή 03 Οκτ 2026')).toThrow(/Weekday/);
  });
});

describe('parseDutyList on real ΦΣΘ PDFs', () => {
  it('parses every fixture, matching its file name', async () => {
    const files = (await readdir(FIXTURES)).filter((file) => file.endsWith('.pdf'));
    expect(files.length).toBeGreaterThanOrEqual(40);
    for (const file of files) {
      const list = await parseFixture(file);
      expect(`${list.date}_${list.groupId}.pdf`).toBe(file);
      for (const section of list.sections) expect(section.entries.length).toBeGreaterThan(0);
    }
  });

  it('covers all ten area groups on each of 3–6 Oct 2026', async () => {
    const files = await readdir(FIXTURES);
    for (const date of ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']) {
      for (const group of AREA_GROUPS) expect(files).toContain(`${date}_${group.id}.pdf`);
    }
  });

  it('reads the metro Saturday list', async () => {
    const list = await parseFixture('2026-10-03_metro.pdf');
    expect(list.groupName).toBe('Πολεοδομικό Συγκρότημα Θεσσαλονίκης');
    expect(summary(list)).toEqual([
      'day 08:00-21:00 ×49',
      'saturday-extra 08:30-14:30 ×59',
      'overnight 21:00-00:00+1 ×31',
      'after-midnight 21:00-08:00+1 ×7',
    ]);
    const day = required(list.sections[0], 'day section');
    expect(day.entries[0]).toEqual({
      locality: 'Αμπελόκηποι',
      name: 'ΛΩΤΙΔΗΣ - ΣΤΑΥΡΑΚΗΣ Ο.Ε.',
      address: 'ΒΕΝΙΖΕΛΟΥ 85',
      phone: '2310733843',
    });
    // A name wrapped over two lines, with the other cells centred on the row.
    expect(day.entries).toContainEqual({
      locality: 'Εύοσμος',
      name: 'Σ.Φ. ΑΝΔΡΕΑΔΟΥ ΒΕΡΟΝΙΚΗ - ΧΙΤΑΡΟΒΑ-ΑΝΔΡΕΑΔΟΥ ΣΥΛΒΑΝΑ Ο.Ε.',
      address: 'ΚΑΡΑΟΛΗ ΔΗΜΗΤΡΙΟΥ 204',
      phone: '2310641155',
    });
    // Latin look-alike letters in the source are replaced.
    expect(day.entries.find((entry) => entry.phone === '2310766760')?.address).toBe(
      'Μ.ΑΛΕΞΑΝΔΡΟΥ 80',
    );
  });

  it('reads the Sunday, weekday and holiday metro lists', async () => {
    expect(summary(await parseFixture('2026-10-04_metro.pdf'))).toEqual([
      'day 08:00-21:00 ×49',
      'overnight 21:00-00:00+1 ×29',
      'after-midnight 21:00-08:00+1 ×6',
    ]);
    expect(summary(await parseFixture('2026-10-05_metro.pdf'))).toEqual([
      'day 08:00-21:00 ×73',
      'overnight 21:00-00:00+1 ×28',
      'after-midnight 21:00-08:00+1 ×6',
    ]);
    expect(summary(await parseFixture('2026-10-06_metro.pdf'))).toEqual([
      'overnight 21:00-00:00+1 ×28',
      'after-midnight 21:00-08:00+1 ×7',
    ]);
    // 15 Aug is a Saturday and a holiday: no extra Saturday-morning section.
    expect(summary(await parseFixture('2026-08-15_metro.pdf'))).toEqual([
      'day 08:00-21:00 ×51',
      'overnight 21:00-00:00+1 ×22',
      'after-midnight 21:00-08:00+1 ×6',
    ]);
  });

  it('reads the Tue/Thu/Fri midday note under the overnight heading', async () => {
    const overnight = required(
      (await parseFixture('2026-10-06_metro.pdf')).sections[0],
      'overnight section',
    );
    expect(overnight.notes).toEqual([
      'Τρίτη, Πέμπτη & Παρασκευή (εκτός αργιών), λειτουργούν και 14:00-17:00 (όχι τα Μεταμεσονύκτια)',
    ]);
    expect(overnight.extraHours).toEqual([
      { weekdays: [2, 4, 5], from: '14:00', to: '17:00', exceptHolidays: true },
    ]);
  });

  it('takes hours from each heading, not from the section kind', async () => {
    expect(summary(await parseFixture('2026-10-03_thermaikos.pdf'))).toEqual([
      'day 08:00-21:00 ×1',
      'on-duty 08:00-00:00+1 ×2',
      'overnight 21:00-08:00+1 ×1',
    ]);
    expect(summary(await parseFixture('2026-10-03_lagkadas.pdf'))).toEqual([
      'on-duty 08:00-23:00 ×1',
      'on-duty 08:00-00:00+1 ×1',
    ]);
  });

  it('keeps headings without hours, with hours left unknown', async () => {
    expect(summary(await parseFixture('2026-10-03_thermi.pdf'))).toEqual([
      'on-duty 08:00-23:00 ×1',
      'on-duty ? ×2',
      'overnight ? ×1',
    ]);
  });

  it('reads a date line that wraps on a long weekday name', async () => {
    const list = await parseFixture('2026-07-24_metro.pdf');
    expect(list.date).toBe('2026-07-24');
    expect(list.sections.map((section) => section.kind)).toEqual([
      'day',
      'overnight',
      'after-midnight',
    ]);
  });

  it('assigns short names to the name column', async () => {
    const list = await parseFixture('2026-10-03_chalkidona.pdf');
    expect(list.sections[0]?.entries.at(-1)).toEqual({
      locality: 'Χαλκηδόνα',
      name: 'ΚΑΠΝΑ ΖΩΗ',
      address: 'ΕΘΝΙΚΗΣ ΑΝΤΙΣΤΑΣΗΣ 38',
      phone: '2391021224',
    });
  });

  it('keeps a phone number with a typo as printed', async () => {
    const list = await parseFixture('2026-10-04_volvi.pdf');
    expect(list.sections[0]?.entries.map((entry) => entry.phone)).toContain('239722000');
  });
});
