import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** A run of text on a PDF page, in PDF points with the origin at the bottom left. */
export interface TextItem {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Font size, which is how the ΦΣΘ PDFs distinguish titles, headings and table text. */
  readonly height: number;
  readonly text: string;
}

/** Extracts every non-empty text run, page by page, in reading order (top to bottom, left to right). */
export async function extractTextItems(data: Uint8Array): Promise<TextItem[]> {
  // pdf.js takes ownership of the buffer, so hand it a copy.
  const task = getDocument({
    data: data.slice(),
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const items: TextItem[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      const pageItems: TextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        pageItems.push({
          page: p,
          x: item.transform[4] as number,
          y: item.transform[5] as number,
          width: item.width,
          height: item.height,
          text: item.str,
        });
      }
      pageItems.sort((a, b) => b.y - a.y || a.x - b.x);
      items.push(...pageItems);
    }
    return items;
  } finally {
    await task.destroy();
  }
}

/** A filled rectangle's bounds, in the same space as `TextItem`. */
export interface FilledBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface PdfPage {
  readonly page: number;
  readonly items: readonly TextItem[];
  /** The bounds of every filled path: a table's cell borders, where it draws them as fills. */
  readonly boxes: readonly FilledBox[];
}

type Matrix = readonly [number, number, number, number, number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Every page's text runs and filled shapes, for tables that only borders can split into rows. */
export async function extractPages(data: Uint8Array): Promise<PdfPage[]> {
  const task = getDocument({ data: data.slice(), useSystemFonts: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    const pages: PdfPage[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const items: TextItem[] = [];
      for (const item of (await page.getTextContent()).items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        items.push({
          page: p,
          x: item.transform[4] as number,
          y: item.transform[5] as number,
          width: item.width,
          height: item.height,
          text: item.str,
        });
      }
      items.sort((a, b) => b.y - a.y || a.x - b.x);

      const boxes: FilledBox[] = [];
      const operators = await page.getOperatorList();
      let matrix: Matrix = [1, 0, 0, 1, 0, 0];
      const saved: Matrix[] = [];
      operators.fnArray.forEach((fn, i) => {
        const args = operators.argsArray[i] as unknown[];
        if (fn === OPS.save) saved.push(matrix);
        else if (fn === OPS.restore) matrix = saved.pop() ?? matrix;
        else if (fn === OPS.transform) matrix = multiply(matrix, args as unknown as Matrix);
        else if (fn === OPS.constructPath) {
          const [paint, , bounds] = args as [number, unknown, ArrayLike<number> | null];
          if ((paint !== OPS.fill && paint !== OPS.eoFill) || !bounds) return;
          const [ax, ay, bx, by] = Array.from(bounds);
          if (ax === undefined || ay === undefined || bx === undefined || by === undefined) return;
          const corners = [
            [ax, ay],
            [bx, by],
          ].map(([x, y]) => [
            matrix[0] * (x ?? 0) + matrix[2] * (y ?? 0) + matrix[4],
            matrix[1] * (x ?? 0) + matrix[3] * (y ?? 0) + matrix[5],
          ]);
          const xs = corners.map((c) => c[0] ?? 0);
          const ys = corners.map((c) => c[1] ?? 0);
          boxes.push({
            x0: Math.min(...xs),
            y0: Math.min(...ys),
            x1: Math.max(...xs),
            y1: Math.max(...ys),
          });
        }
      });
      pages.push({ page: p, items, boxes });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
