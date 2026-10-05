import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { OTC_LISTING, PRESCRIPTION_LISTING, parseListing, type MohFile } from '../sources/moh.ts';
import { OTC_BASE, PRESCRIPTION_BASE, findBase, planTables } from './plan.ts';

const fixture = (name: string) =>
  readFile(new URL(`../../fixtures/moh/${name}`, import.meta.url), 'utf8');

const file = (id: number, name: string): MohFile => ({ id, name, url: `https://x/?fdl=${id}` });

describe('planTables', () => {
  it('starts from the amended yearly revision on the real listing', async () => {
    const page1 = parseListing(await fixture('deltia-timwn-page1.html'), PRESCRIPTION_LISTING);
    // Page 1 ends before the revision of December 2025; page 2 (article 14046) has it.
    expect(findBase(page1, PRESCRIPTION_BASE)).toBeNull();
    const amendment = {
      id: 14046,
      url: `${PRESCRIPTION_LISTING}/14046-x`,
      date: '2026-02-20',
      title:
        'Ο.Ε. «Τροποποίηση της υπό στοιχεία Δ3(α) 58275/29-12-2025 απόφασης με θέμα: «Δελτίο αναθεωρημένων τιμών φαρμάκων ανθρώπινης χρήσης, Δεκεμβρίου 2025»»',
    };
    const original = {
      id: 13924,
      url: `${PRESCRIPTION_LISTING}/13924-x`,
      date: '2025-12-29',
      title: 'Δελτίο αναθεωρημένων τιμών φαρμάκων ανθρώπινης χρήσης, Δεκεμβρίου 2025',
    };
    const all = [...page1, amendment, original];
    const base = findBase(all, PRESCRIPTION_BASE);
    expect(base?.id).toBe(14046);
    if (!base) return;

    const plan = planTables(base, all, (article) =>
      article.id === 14805
        ? [file(1, 'decision.pdf'), file(2, 'Πίνακας Νέων.xlsx'), file(3, 'Πίνακας Ανατιμ..xlsx')]
        : article.id === 14304
          ? [file(4, 'decision.pdf')]
          : [file(article.id, `${article.id}.xlsx`)],
    );
    expect(plan.tables[0]?.article.id).toBe(14046);
    expect(plan.tables.at(-2)?.file.id).toBe(2);
    expect(plan.tables.at(-1)?.file.id).toBe(3);
    const ids = plan.tables.map((t) => t.article.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids).not.toContain(13924);
    expect(plan.withoutTable.map((a) => a.id)).toEqual([14304]);
  });

  it('finds the yearly non-prescription catalogue on the real listing', async () => {
    const links = parseListing(await fixture('deltia-timwn-mhsyfa-page1.html'), OTC_LISTING);
    expect(findBase(links, OTC_BASE)?.id).toBe(13661);
  });

  it('refuses a base without exactly one table', () => {
    const base = { id: 1, url: 'https://x/1', date: '2026-01-01', title: 'base' };
    expect(() => planTables(base, [base], () => [file(1, 'a.pdf')])).toThrow(/0 \.xlsx/);
  });
});
