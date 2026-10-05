import { XMLParser } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';

/** A worksheet as rows of cell text; empty cells are ''. */
export type Sheet = string[][];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ['sheet', 'Relationship', 'si', 'r', 'row', 'c'].includes(name),
});

type Xml = Record<string, unknown>;

function text(node: unknown): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  const element = node as Xml;
  if ('#text' in element) return text(element['#text']);
  // A rich-text string is a list of runs, each with its own <t>.
  if ('r' in element) return text((element.r as Xml[]).map((run) => run.t));
  if ('t' in element) return text(element.t);
  return '';
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? '';
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

/** Reads the first worksheet of an .xlsx file. Supports shared and inline strings and numbers. */
export function readFirstSheet(data: Uint8Array): Sheet {
  const files = unzipSync(data);
  const read = (path: string): Xml => {
    const file = files[path];
    if (!file) throw new Error(`Missing ${path} in workbook`);
    return parser.parse(strFromU8(file)) as Xml;
  };

  const workbook = read('xl/workbook.xml').workbook as Xml;
  const firstSheet = ((workbook.sheets as Xml).sheet as Xml[])[0];
  if (!firstSheet) throw new Error('Workbook has no sheets');
  const relations = (read('xl/_rels/workbook.xml.rels').Relationships as Xml).Relationship as Xml[];
  const target = relations.find((rel) => rel.Id === firstSheet['r:id'])?.Target as string;
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;

  const shared = files['xl/sharedStrings.xml']
    ? (((read('xl/sharedStrings.xml').sst as Xml).si as Xml[] | undefined) ?? []).map(text)
    : [];

  const sheetData = (read(sheetPath).worksheet as Xml).sheetData as Xml | '';
  const rows = (sheetData && (sheetData.row as Xml[])) || [];
  const sheet: Sheet = [];
  for (const row of rows) {
    const cells: string[] = [];
    for (const cell of (row.c as Xml[] | undefined) ?? []) {
      const value =
        cell.t === 's'
          ? (shared[Number(text(cell.v))] ?? '')
          : cell.t === 'inlineStr'
            ? text(cell.is)
            : text(cell.v);
      cells[columnIndex(cell.r as string)] = value;
    }
    sheet[Number(row.r) - 1] = Array.from(cells, (value) => value ?? '');
  }
  return Array.from(sheet, (row) => row ?? []);
}
