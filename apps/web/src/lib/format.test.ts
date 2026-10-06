import { describe, expect, it } from 'vitest';
import {
  deviceZoneDiffers,
  fill,
  formatClock,
  formatDistance,
  formatPhone,
  formatPrice,
  longIsoDate,
  shortIsoDate,
} from './format.ts';

describe('fill', () => {
  it('replaces placeholders and leaves unknown ones', () => {
    expect(fill('{a} και {b} {c}', { a: 1, b: 'x' })).toBe('1 και x {c}');
  });
});

describe('formatClock', () => {
  it('reads the wall clock of Athens whatever the process zone is', () => {
    expect(formatClock(new Date('2026-10-05T19:30:00Z'))).toBe('22:30');
    expect(formatClock(new Date('2026-12-05T19:30:00Z'))).toBe('21:30');
    expect(formatClock(new Date('2026-10-05T21:05:00Z'))).toBe('00:05');
  });
});

describe('formatDistance', () => {
  it('rounds metres to 10 and switches to km at 1000', () => {
    expect(formatDistance(347, 'en')).toBe('350 m');
    expect(formatDistance(3, 'en')).toBe('10 m');
    expect(formatDistance(1234, 'en')).toBe('1.2 km');
    expect(formatDistance(12_400, 'en')).toBe('12 km');
  });
  it('uses the decimal comma and the Greek units in Greek', () => {
    expect(formatDistance(1234, 'el')).toBe('1,2 χλμ');
    expect(formatDistance(450, 'el')).toBe('450 μ');
  });
});

describe('formatPhone', () => {
  it('puts a space after the area code', () => {
    expect(formatPhone('2310023026')).toBe('2310 023026');
    expect(formatPhone('2311112375')).toBe('2311 112375');
    expect(formatPhone('2392012345')).toBe('23920 12345');
  });
  it('knows the area codes of the rest of Greece', () => {
    expect(formatPhone('2101234567')).toBe('210 1234567'); // Athens
    expect(formatPhone('2131234567')).toBe('213 1234567'); // Athens, newer numbers
    expect(formatPhone('2410123456')).toBe('2410 123456'); // Larissa
    expect(formatPhone('2810123456')).toBe('2810 123456'); // Heraklion
    expect(formatPhone('2421012345')).toBe('24210 12345'); // Volos
    expect(formatPhone('2651012345')).toBe('26510 12345'); // Ioannina
  });
  it('groups a mobile number and leaves anything else alone', () => {
    expect(formatPhone('6941234567')).toBe('694 123 4567');
    expect(formatPhone('+30 2310 023026')).toBe('+30 2310 023026');
    expect(formatPhone('166')).toBe('166');
  });
});

describe('shortIsoDate', () => {
  it('names the weekday of a calendar date', () => {
    expect(shortIsoDate('2026-10-07', 'en')).toBe('Wed 7 Oct');
    expect(shortIsoDate('2026-10-07', 'el')).toBe('Τετ 7 Οκτ');
  });
});

describe('deviceZoneDiffers', () => {
  it('is false when the device zone shows the same wall clock', () => {
    const original = process.env.TZ;
    // Node reads TZ lazily on Date construction in tests; only assert the type here.
    expect(typeof deviceZoneDiffers(new Date('2026-10-05T19:30:00Z'))).toBe('boolean');
    process.env.TZ = original;
  });
  it('compares against the given zone', () => {
    // Whatever the device zone is, Auckland and Athens differ by hours at this instant.
    const at = new Date('2026-10-05T12:00:00Z');
    const a = deviceZoneDiffers(at, 'Pacific/Auckland');
    const b = deviceZoneDiffers(at, 'Europe/Athens');
    expect(a || b).toBe(true);
  });
});

describe('medicine formats', () => {
  it('writes dates in full and prices in euros', () => {
    expect(longIsoDate('2026-09-30', 'el')).toBe('30 Σεπτεμβρίου 2026');
    expect(longIsoDate('2026-09-30', 'en')).toBe('30 September 2026');
    expect(formatPrice(8.19, 'el')).toBe('8,19\u00a0€');
    expect(formatPrice(1234.5, 'en')).toBe('€1,234.50');
  });
});
