import { describe, expect, it } from 'vitest';
import { findXlsxLink, periodFromTitle } from './pkm.ts';
import { dutyDateFromUrl } from './thessguide.ts';

describe('dutyDateFromUrl', () => {
  it('reads the date from encoded and plain file names', () => {
    expect(
      dutyDateFromUrl(
        'https://www.thess.guide/wp-content/uploads/2026/09/%CE%95%CF%86%CE%B7%CE%BC%CE%B5%CF%81%CE%AF%CE%B5%CF%82_05-10-2026-2-1.pdf',
      ),
    ).toBe('2026-10-05');
    expect(dutyDateFromUrl('https://x/uploads/Εφημερίες_03-10-2026.pdf')).toBe('2026-10-03');
    expect(dutyDateFromUrl('https://x/uploads/Εφημερίες-νοσοκομείων_03-10-2026.pdf')).toBeNull();
  });
});

describe('ΠΚΜ announcements', () => {
  it('reads the period of a Thessaloniki announcement only', () => {
    expect(
      periodFromTitle(
        'Ανακοίνωση που αφορά το διευρυμένο ωράριο φαρμακείων της Μ.Ε. Θεσσαλονίκης από 01-09-2026 έως 31-10-2026, σύμφωνα με τους πίνακες που καταρτίζει ο Φ.Σ.Θ.',
      ),
    ).toEqual({ from: '2026-09-01', to: '2026-10-31' });
    expect(periodFromTitle('ΔΙΕΥΡΥΜΕΝΟ ΩΡΑΡΙΟ ΦΑΡΜΑΚΕΙΩΝ Π.Ε. ΠΕΛΛΑΣ ΙΟΥΛΙΟΥ 2026')).toBeNull();
  });

  it('finds the xlsx attachment', () => {
    expect(
      findXlsxLink(
        '<a href="https://www.pkm.gov.gr/wp-content/uploads/2026/08/2026_08_31_ΔΙΕΥΡΥΜΕΝΟ-ΩΡΑΡΙΟ-ΣΕΠΤ-ΟΚΤ2026.xlsx">x</a>',
      ),
    ).toBe(
      'https://www.pkm.gov.gr/wp-content/uploads/2026/08/2026_08_31_ΔΙΕΥΡΥΜΕΝΟ-ΩΡΑΡΙΟ-ΣΕΠΤ-ΟΚΤ2026.xlsx',
    );
  });
});
