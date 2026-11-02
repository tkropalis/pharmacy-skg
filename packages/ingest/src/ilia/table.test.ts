import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TextItem } from '../pdf.ts';
import { parseDutyTable, type Table, type TableRow } from './table.ts';

/**
 * Pages of the real duty table (ADA ΡΣΦΞ7Λ6-2Κ3), as the text runs pdf.js reads from them
 * (pdf.ts, `extractTextItems`), a run to a line: [page, x, y, width, height, text]. Each file is
 * a stretch of consecutive pages where the printing does something to a row; a block that starts
 * inside a town's table carries the town's heading as page 0.
 */
function pages(name: string): TextItem[] {
  const rows = JSON.parse(
    readFileSync(new URL(`../../fixtures/ilia/duty-table_${name}.json`, import.meta.url), 'utf8'),
  ) as [number, number, number, number, number, string][];
  return rows.map(([page, x, y, width, height, text]) => ({ page, x, y, width, height, text }));
}

const rowsOn = (table: Table, date: string): TableRow[] =>
  table.rows.filter((row) => row.date === date);

/** A day's duties as [hours, overnight, phone], by their hours. */
const shape = (rows: readonly TableRow[]) =>
  rows
    .map((r) => [r.hours, r.overnight, r.phone] as const)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

/** Every date from the first to the last, once each (one pharmacy a day in the small towns). */
function expectOnePerDay(table: Table): void {
  const dates = table.rows.map((row) => row.date).sort();
  const first = new Date(`${dates[0]}T00:00:00Z`);
  const last = new Date(`${dates.at(-1)}T00:00:00Z`);
  const days = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  expect(dates).toHaveLength(days);
  expect(new Set(dates).size).toBe(days);
}

describe('parseDutyTable', () => {
  it('reads a night and a day pharmacy for each day, and the row printed as one line', () => {
    const table = parseDutyTable(pages('p007-008'));
    expect(table.warnings).toEqual([]);
    expect(table.year).toBe(2026);

    expect(shape(rowsOn(table, '2026-01-01'))).toEqual([
      ['08:00-17:00', false, '2622022244'],
      ['17:00-08:00', true, '2622023912'],
    ]);
    // A night duty with a morning window too: two windows in one row.
    expect(rowsOn(table, '2026-01-02')[0]).toMatchObject({
      town: 'ΑΜΑΛΙΑΔΑ',
      hours: '08:00-14:30 & 17:30-08:00',
      overnight: true,
      phone: '2622021543',
    });
    // 12 Jan's day pharmacy is printed as one line of text, with no columns.
    expect(shape(rowsOn(table, '2026-01-12'))).toEqual([
      ['08:00-14:30 & 17:30-08:00', true, '2622023912'],
      ['08:00-21:00', false, '2622022244'],
    ]);
    const giannakopoulos = table.pharmacies.find((p) => p.phone === '2622022244');
    expect(giannakopoulos).toMatchObject({
      town: 'ΑΜΑΛΙΑΔΑ',
      name: 'ΓΙΑΝΝΑΚΟΠΟΥΛΟΣ ΠΕΤΡΟΣ',
      address: 'ΚΑΛΑΒΡΥΤΩΝ 19',
    });
  });

  it('joins the two halves of a row the page break cut, wherever its pieces landed', () => {
    // 26 Jan: its hours and flag are at the foot of the page before, the rest at the top of the
    // next. 21 Mar: all but its date is at the foot (16 to 22 Mar is one pharmacy's week).
    const table = parseDutyTable(pages('p057-060'));
    expect(table.warnings).toEqual([]);
    expectOnePerDay(table);
    expect(rowsOn(table, '2026-01-26')).toEqual([
      expect.objectContaining({
        town: 'ΑΡΧΑΙΑ ΟΛΥΜΠΙΑ',
        hours: '08:00-08:00*',
        overnight: true,
        phone: '2624023306',
      }),
    ]);
    expect(rowsOn(table, '2026-03-21')).toEqual([
      expect.objectContaining({ hours: '08:00-08:00*', overnight: true, phone: '2624022000' }),
    ]);
    expect(table.pharmacies.map((p) => [p.phone, p.name, p.address])).toEqual([
      ['2624022000', 'ΠΑΠΑΒΑΣΙΛΕΙΟΥ ΔΗΜΗΤΡΙΟΣ', 'ΚΟΝΔΥΛΗ ΠΡΑΞΙΤΕΛΗ 60'],
      ['2624023306', 'Σ.Φ. ΜΙΤΕΒΑ ΙΒΑΝΚΑ ΚΑΙ ΠΟΛΙΤΗΣ ΓΙΑΝΝΗΣ Ο.Ε.', 'ΤΣΟΥΡΕΚΑ 2'],
    ]);
  });

  it('counts a row printed twice once, and finds the cut row on the same page', () => {
    // 3 Aug is at the foot of one page and whole at the top of the next; 30 Aug has only its date
    // at the top of its page and the rest at the foot of the same one.
    const table = parseDutyTable(pages('p065-067'));
    expect(table.warnings).toEqual([]);
    expectOnePerDay(table);
    expect(rowsOn(table, '2026-08-30')).toEqual([
      expect.objectContaining({ hours: '08:00-08:00*', overnight: true, phone: '2624023306' }),
    ]);
  });

  it("reads Varda's table, which names a pharmacist a day and has no phone", () => {
    const table = parseDutyTable(pages('p073'));
    expect(table.warnings).toEqual([]);
    expect(table.rows[0]).toEqual({
      town: 'ΒΑΡΔΑ',
      date: '2026-01-01',
      hours: null,
      overnight: true,
      phone: null,
      name: 'ΛΕΥΚΑΔΙΤΗ Σ. ΓΕΩΡΓΙΑ',
      page: 73,
    });
    expectOnePerDay(table);
    expect(table.pharmacies.map((p) => p.name)).toEqual([
      'ΛΕΥΚΑΔΙΤΗ Σ. ΓΕΩΡΓΙΑ',
      'ΜΑΡΚΟΥ ΑΝΝΑ - ΘΕΩΝΗ',
      'ΜΑΡΚΟΥ ΧΡΙΣΤΙΑΝΑ',
      'ΣΠΥΡΟΠΟΥΛΟΣ ΙΩΑΝΝΗΣ',
      'ΧΟΥΝΤΡΑ ΔΗΜΗΤΡΑ',
      'ΧΟΥΝΤΡΑ ΘΕΟΔΩΡΑ',
    ]);
    expect(table.pharmacies.every((p) => p.phone === null && p.address === '')).toBe(true);
  });

  it('takes the weekday from the lines that run over to the next page', () => {
    // 18 Sep's weekday and the end of its name are the first lines of the next page.
    const table = parseDutyTable(pages('p107-108'));
    expect(table.warnings).toEqual([]);
    expect(rowsOn(table, '2026-09-18')).toEqual([
      expect.objectContaining({ town: 'ΓΑΣΤΟΥΝΗ', phone: '2623033003', overnight: true }),
    ]);
  });

  it('finishes hours that are cut at the foot of the page', () => {
    const table = parseDutyTable(pages('p164-165'));
    expect(table.warnings).toEqual([]);
    expect(shape(rowsOn(table, '2026-01-13'))).toEqual([
      ['08:00-14:30 & 18:00-08:00', true, '2621026000'],
      ['08:00-20:30', false, '2621028282'],
    ]);
    // Pyrgos's names and addresses, wrapped over lines and in columns that move.
    expect(table.pharmacies.find((p) => p.phone === '2621034285')).toMatchObject({
      name: 'ΚΑΡΑΛΗ ΑΓΓΕΛΙΚΗ (ΠΡΩΗΝ ΚΑΠΕΝΗΣ ΝΙΚΟΛΑΟΣ)',
      address: 'ΕΡΜΟΥ 78',
    });
  });

  it('gives a row the cells that sit above its date, in a layout where they do', () => {
    const table = parseDutyTable(pages('p177'));
    expect(table.warnings).toEqual([]);
    expect(shape(rowsOn(table, '2026-06-01'))).toEqual([
      ['08:00-18:00', false, '2621028166'],
      ['18:00-08:00', true, '2621033181'],
    ]);
  });

  it("keeps a row's lines together where the table's header falls in the middle of them", () => {
    const table = parseDutyTable(pages('p182-183'));
    expect(table.warnings).toEqual([]);
    expect(shape(rowsOn(table, '2026-08-03'))).toEqual([
      ['08:00-14:30 & 18:00-08:00', true, '2621022616'],
      ['08:00-20:30', false, '2621033181'],
    ]);
    expect(
      rowsOn(table, '2026-08-04')
        .map((r) => r.phone)
        .sort(),
    ).toEqual(['2621027706', '2621061535']);
  });

  it("reports a row whose weekday is not its date's, and leaves it out", () => {
    const items = pages('p007-008').map((item) =>
      // 4 Jan 2026 is a Sunday.
      item.text === 'Κυριακή' && Math.abs(item.y - 563) < 15 ? { ...item, text: 'Δευτέρα' } : item,
    );
    const table = parseDutyTable(items);
    expect(table.warnings).toHaveLength(1);
    expect(table.warnings[0]).toMatchObject({ code: 'unreadable-row' });
    expect(table.warnings[0]?.message).toContain('4/1/2026');
    expect(rowsOn(table, '2026-01-04')).toHaveLength(1);
  });

  it('fails when there is no town heading', () => {
    expect(() =>
      parseDutyTable(pages('p007-008').filter((item) => !/ 2026$/.test(item.text))),
    ).toThrow(/No town heading/);
  });
});
