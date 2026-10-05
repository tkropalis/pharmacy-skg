import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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
