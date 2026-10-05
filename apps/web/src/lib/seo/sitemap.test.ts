import { describe, expect, it } from 'vitest';
import { phoneToE164, pharmacyJsonLd, jsonLdScript, telHref } from './jsonld.ts';
import { realModel } from './test-data.ts';
import { renderRobots, renderSitemap, sitemapEntries } from './sitemap.ts';
import { directionsUrl } from './views.ts';

const model = realModel('2026-10-05');

describe('sitemapEntries', () => {
  const entries = sitemapEntries(model);
  const paths = entries.flatMap((e) => Object.values(e.alternates));

  it('has every page once per locale and no duplicates', () => {
    expect(new Set(paths).size).toBe(paths.length);
    // Home, about and privacy (not report), the two index pages, then the generated pages.
    const expected =
      3 + 2 + model.publishedDates.length + model.areas.length + model.pharmacies.length;
    expect(entries).toHaveLength(expected);
  });

  it('leaves out the report form and the 404 page', () => {
    expect(paths.some((p) => p.includes('anafora') || p.includes('/report'))).toBe(false);
    expect(paths.some((p) => p.includes('/404'))).toBe(false);
  });

  it('includes the index pages and a page of each kind', () => {
    for (const path of ['/', '/en/', '/efimeries/', '/en/duty/', '/perioxi/', '/en/area/']) {
      expect(paths).toContain(path);
    }
    expect(paths).toContain('/en/pharmacy/2310023026/');
    expect(paths).toContain('/efimeries/2026-10-05/');
    expect(paths).toContain('/perioxi/kalamaria/');
  });
});

describe('renderSitemap', () => {
  const xml = renderSitemap(sitemapEntries(model), 'https://example.test');

  it('lists each locale as a url with hreflang alternates for both and x-default', () => {
    expect(xml).toContain('<loc>https://example.test/farmakeio/2310023026/</loc>');
    expect(xml).toContain('<loc>https://example.test/en/pharmacy/2310023026/</loc>');
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="el" href="https://example.test/farmakeio/2310023026/"/>',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://example.test/en/pharmacy/2310023026/"/>',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://example.test/farmakeio/2310023026/"/>',
    );
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect((xml.match(/<url>/g) ?? []).length).toBe(sitemapEntries(model).length * 2);
  });

  it('stays within the sitemap limit of 50,000 URLs', () => {
    expect((xml.match(/<url>/g) ?? []).length).toBeLessThan(50_000);
  });

  it('escapes markup characters', () => {
    const odd = renderSitemap([{ alternates: { el: '/a&b/', en: '/en/a<b/' } }], 'https://x.test');
    expect(odd).toContain('/a&amp;b/');
    expect(odd).toContain('/en/a%3Cb/');
  });
});

describe('renderRobots', () => {
  it('points to the sitemap with the full site address', () => {
    expect(renderRobots('https://example.test')).toBe(
      'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /data/\n\nSitemap: https://example.test/sitemap.xml\n',
    );
  });
});

describe('phone numbers', () => {
  it('normalises Greek numbers', () => {
    expect(phoneToE164('2310023026')).toBe('+302310023026');
    expect(phoneToE164('231 002 3026')).toBe('+302310023026');
    expect(phoneToE164('+30 2310 023026')).toBe('+302310023026');
    expect(phoneToE164(null)).toBeNull();
    expect(phoneToE164('123')).toBeNull();
    expect(telHref('2310023026')).toBe('tel:+302310023026');
    expect(telHref(null)).toBeNull();
  });
});

describe('pharmacyJsonLd', () => {
  const base = model.pharmacies[0];
  if (base === undefined) throw new Error('no pharmacies');

  it('adds coordinates only for exact or street precision', () => {
    const at = (precision: 'exact' | 'street' | 'locality') => ({
      ...base,
      location: { lat: 40.6, lon: 22.9, source: 'override' as const, precision },
    });
    expect(pharmacyJsonLd(at('exact'), 'https://x.test/p/')).toHaveProperty('geo');
    expect(pharmacyJsonLd(at('street'), 'https://x.test/p/')).toHaveProperty('geo');
    expect(pharmacyJsonLd(at('locality'), 'https://x.test/p/')).not.toHaveProperty('geo');
    expect(pharmacyJsonLd({ ...base, location: null }, 'https://x.test/p/')).not.toHaveProperty(
      'geo',
    );
  });

  it('never emits opening hours', () => {
    expect(pharmacyJsonLd(base, 'https://x.test/p/')).not.toHaveProperty(
      'openingHoursSpecification',
    );
  });

  it('is safe inside a script element', () => {
    expect(jsonLdScript({ a: '</script><b>' })).not.toContain('<');
    expect(JSON.parse(jsonLdScript({ a: '</script>' }))).toEqual({ a: '</script>' });
  });
});

describe('directionsUrl', () => {
  const base = model.pharmacies[0];
  if (base === undefined) throw new Error('no pharmacies');

  it('uses coordinates when sure, else the address', () => {
    const exact = {
      ...base,
      location: { lat: 40.5, lon: 22.9, source: 'override' as const, precision: 'exact' as const },
    };
    expect(directionsUrl(exact)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.5%2C22.9',
    );
    const vague = { ...exact, location: { ...exact.location, precision: 'locality' as const } };
    const url = new URL(directionsUrl(vague));
    expect(url.searchParams.get('destination')).toContain(base.address);
    expect(url.searchParams.get('destination')).toContain(base.locality);
  });
});
