import { describe, expect, it } from 'vitest';
import {
  closedReportMessage,
  fallbackIssueUrl,
  isReportType,
  pharmacyFromSearch,
  reportFormSearch,
  singleLine,
  typeFromSearch,
} from './report.ts';

describe('pharmacyFromSearch', () => {
  it('reads ?pharmacy=', () => {
    expect(pharmacyFromSearch('?pharmacy=2310733843')).toBe('2310733843');
    expect(pharmacyFromSearch('?a=1&pharmacy=x-ab12')).toBe('x-ab12');
  });

  it('is empty when absent, cleaned when odd, and capped', () => {
    expect(pharmacyFromSearch('')).toBe('');
    expect(pharmacyFromSearch('?pharmacy=a%0Ab%00c')).toBe('a b c');
    expect(pharmacyFromSearch(`?pharmacy=${'x'.repeat(500)}`)).toHaveLength(120);
  });
});

describe('singleLine', () => {
  it('collapses whitespace and control characters', () => {
    expect(singleLine('  a \n\t b\u0000c ')).toBe('a b c');
  });
});

describe('isReportType', () => {
  it('accepts the five types only', () => {
    expect(isReportType('wrong-phone')).toBe(true);
    expect(isReportType('spam')).toBe(false);
  });
});

describe('fallbackIssueUrl', () => {
  it('builds a prefilled new-issue link', () => {
    const url = new URL(
      fallbackIssueUrl(
        { pharmacy: '2310733843', type: 'wrong-phone', message: 'Το τηλέφωνο δεν απαντά' },
        'Λάθος τηλέφωνο',
        'Αναφορά',
        'χωρίς φαρμακείο',
      ),
    );
    expect(url.origin + url.pathname).toBe('https://github.com/tkropalis/pharmacy-skg/issues/new');
    expect(url.searchParams.get('title')).toBe('Αναφορά: Λάθος τηλέφωνο, 2310733843');
    expect(url.searchParams.get('body')).toContain('Το τηλέφωνο δεν απαντά');
    expect(url.searchParams.get('labels')).toBe('report');
  });

  it('names a missing pharmacy and caps the message', () => {
    const url = new URL(
      fallbackIssueUrl(
        { pharmacy: ' ', type: 'other', message: 'x'.repeat(2000) },
        'Άλλο',
        'Αναφορά',
        'χωρίς φαρμακείο',
      ),
    );
    expect(url.searchParams.get('title')).toBe('Αναφορά: Άλλο, χωρίς φαρμακείο');
    expect((url.searchParams.get('body') ?? '').length).toBeLessThan(1100);
  });
});

describe('typeFromSearch', () => {
  it('reads a known ?type= and ignores anything else', () => {
    expect(typeFromSearch('?pharmacy=1&type=closed-but-listed-open')).toBe(
      'closed-but-listed-open',
    );
    expect(typeFromSearch('?type=nonsense')).toBeNull();
    expect(typeFromSearch('')).toBeNull();
  });

  it('round-trips with reportFormSearch', () => {
    const search = reportFormSearch('x-ab12cd34ef', 'closed-but-listed-open');
    expect(pharmacyFromSearch(search)).toBe('x-ab12cd34ef');
    expect(typeFromSearch(search)).toBe('closed-but-listed-open');
  });
});

describe('closedReportMessage', () => {
  it('says when, in Athens time, and what the app showed', () => {
    // 02:15 in Athens (UTC+3) on 7 Oct 2026.
    expect(closedReportMessage(new Date('2026-10-06T23:15:00Z'), 'Εφημερεύει έως 08:00')).toBe(
      'Βρέθηκε κλειστό: 7/10/2026, 02:15. Η εφαρμογή έδειχνε: Εφημερεύει έως 08:00.',
    );
  });
});
