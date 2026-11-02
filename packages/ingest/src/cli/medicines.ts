/**
 * Rebuilds data/medicines/medicines.json from the Ministry of Health's price bulletins and ΕΟΦ's
 * limited-availability list, validates it and writes it only if it changed. Exits non-zero,
 * writing nothing, if validation fails. When the ministry's site cannot be read, the stored
 * prices stay, ΕΟΦ's list is still applied to them, and it exits non-zero. The work is in
 * update/medicines.ts.
 *
 *   node src/cli/medicines.ts [--force]
 *
 * The bulletins and the list are downloaded only when the set of them changed since the last
 * run (or with --force). Each article's attachments are cached in data/medicines/inputs/, as
 * published articles rarely change; one whose cached table is gone is read again.
 */
import { parseArgs } from 'node:util';
import { parseShortageList } from '../medicines/shortages.ts';
import { extractTextItems } from '../pdf.ts';
import { findShortageList } from '../sources/eof.ts';
import { getBytes } from '../sources/http.ts';
import { articleFiles, listArticles } from '../sources/moh.ts';
import { medicinesPaths } from '../store.ts';
import { consoleLogger } from '../update/logger.ts';
import { updateMedicines } from '../update/medicines.ts';

const { values: args } = parseArgs({
  options: { force: { type: 'boolean', default: false } },
});

process.exitCode = await updateMedicines({
  sources: {
    listArticles,
    articleFiles,
    findShortageList,
    readShortageList: async (link) =>
      parseShortageList(await extractTextItems(await getBytes(link.fileUrl))),
    getBytes,
  },
  paths: medicinesPaths(),
  force: args.force,
  logger: consoleLogger,
});
