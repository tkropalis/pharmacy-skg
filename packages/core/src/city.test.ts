import { describe, expect, it } from 'vitest';
import { CITIES, LOCALES, THESSALONIKI, cityAt, cityById } from './city.ts';

describe('CITIES', () => {
  it('uses unique, URL-safe ids', () => {
    const ids = CITIES.map((city) => city.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('names every city in every locale', () => {
    for (const city of CITIES) {
      for (const locale of LOCALES) expect(city.name[locale]).not.toBe('');
    }
  });

  it('uses valid IANA time zones', () => {
    for (const city of CITIES) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: city.timeZone })).not.toThrow();
    }
  });

  it('keeps each centre inside its bounds, within Greece', () => {
    for (const city of CITIES) {
      const [west, south, east, north] = city.bounds;
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
      expect(west).toBeGreaterThan(19);
      expect(east).toBeLessThan(30);
      expect(south).toBeGreaterThan(34);
      expect(north).toBeLessThan(42);
      const [lon, lat] = city.center;
      expect(cityAt({ lat, lon })).toBe(city);
    }
  });
});

describe('cityById', () => {
  it('finds a city by its id', () => {
    expect(cityById('thessaloniki')).toBe(THESSALONIKI);
    expect(cityById('atlantis')).toBeUndefined();
  });
});

describe('cityAt', () => {
  it('finds the area a position is in', () => {
    expect(cityAt({ lat: 40.5947, lon: 22.9603 })).toBe(THESSALONIKI); // Kalamaria
    expect(cityAt({ lat: 40.7494, lon: 23.0683 })).toBe(THESSALONIKI); // Λαγκαδάς
    expect(cityAt({ lat: 40.7245, lon: 23.7117 })).toBe(THESSALONIKI); // Ασπροβάλτα
  });

  it('finds the areas on the ITeQ platform, the more specific where boxes overlap', () => {
    const at = (lat: number, lon: number) => cityAt({ lat, lon })?.id;
    expect(at(35.3387, 25.1442)).toBe('herakleion');
    expect(at(37.0389, 22.1142)).toBe('messinia'); // Kalamata
    expect(at(36.434, 28.2251)).toBe('dodecanese'); // Rhodes
    expect(at(37.942, 23.647)).toBe('piraeus');
    expect(at(37.94, 23.49)).toBe('piraeus'); // Salamina
    expect(at(37.746, 23.43)).toBe('piraeus'); // Aegina
    expect(at(39.362, 22.944)).toBe('magnesia'); // Volos, inside Larissa's box too
    expect(at(38.852, 23.047)).toBe('evia'); // Edipsos, inside Fthiotida's box too
    expect(at(38.463, 23.597)).toBe('evia'); // Chalkida
    expect(at(38.015, 24.419)).toBe('evia'); // Karystos
    expect(at(38.9, 22.434)).toBe('fthiotida'); // Lamia
  });

  it("tells Attica's association from Piraeus's where they meet", () => {
    const at = (lat: number, lon: number) => cityAt({ lat, lon })?.id;
    expect(at(37.9755, 23.7348)).toBe('attiki'); // Σύνταγμα
    expect(at(37.955, 23.702)).toBe('attiki'); // Καλλιθέα
    expect(at(37.992, 23.682)).toBe('attiki'); // Αιγάλεω
    expect(at(37.99, 23.659)).toBe('attiki'); // Αγία Βαρβάρα
    expect(at(38.041, 23.543)).toBe('attiki'); // Ελευσίνα
    expect(at(37.996, 23.344)).toBe('attiki'); // Μέγαρα
    expect(at(38.153, 23.963)).toBe('attiki'); // Μαραθώνας
    expect(at(38.022, 24.005)).toBe('attiki'); // Ραφήνα
    expect(at(37.714, 24.056)).toBe('attiki'); // Λαύριο
    expect(at(38.322, 23.765)).toBe('attiki'); // Σκάλα Ωρωπού
    expect(at(37.984, 23.65)).toBe('piraeus'); // Κορυδαλλός
    expect(at(37.975, 23.645)).toBe('piraeus'); // Νίκαια
    expect(at(37.952, 23.68)).toBe('piraeus'); // Μοσχάτο
    expect(at(38.392, 23.795)).toBe('evia'); // Ερέτρια, across the strait
    expect(at(37.94, 22.93)).toBe('korinthia'); // Κόρινθος
  });

  it.each([
    ['Thiva', 38.325, 23.319],
    ['Oinofyta', 38.312, 23.637],
    ['Livadeia', 38.436, 22.875],
    ['Patra', 38.2466, 21.7346],
    ['Agrinio', 38.6218, 21.4078],
    ['Corfu', 39.6243, 19.9217],
    ['Lefkada', 38.8336, 20.7069],
    ['Argostoli', 38.1754, 20.489],
    ['Rethymno', 35.3693, 24.4739],
    ['Komotini', 41.1224, 25.4066],
    ['Serres', 41.0856, 23.5484],
    ['Kastoria', 40.5193, 21.2687],
    ['Florina', 40.782, 21.4098],
    ['Chios', 38.368, 26.1358],
    ['Mytilene', 39.1047, 26.5551],
    ['Naxos', 37.1036, 25.3766],
    ['Ermoupoli', 37.4448, 24.9425],
  ])('finds none in %s, which is not covered', (_, lat, lon) => {
    expect(cityAt({ lat, lon })).toBeUndefined();
  });
});
