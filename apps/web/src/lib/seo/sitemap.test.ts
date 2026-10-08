import { describe, expect, it } from 'vitest';
import {
  breadcrumbJsonLd,
  phoneToE164,
  pharmacyJsonLd,
  jsonLdScript,
  telHref,
  websiteJsonLd,
} from './jsonld.ts';
import { realModel } from './test-data.ts';
import { renderRobots, renderSitemap, sitemapEntries } from './sitemap.ts';
import { directionsUrl } from './views.ts';

const model = realModel('2026-10-05');
const larisa = realModel('2026-10-07', 'larisa');
const models = [model, larisa];

describe('sitemapEntries', () => {
  const entries = sitemapEntries(models);
  const paths = entries.flatMap((e) => Object.values(e.alternates));

  it('has every page of every city once per locale and no duplicates', () => {
    expect(new Set(paths).size).toBe(paths.length);
    // Home, about and privacy (not report), the two index pages, then each city's pages: its
    // page for today, its dates, areas and pharmacies.
    const generated = models.reduce(
      (n, m) => n + 1 + m.publishedDates.length + m.areas.length + m.pharmacies.length,
      0,
    );
    expect(entries).toHaveLength(3 + 2 + generated);
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
    expect(paths).toContain('/efimeries/thessaloniki/2026-10-05/');
    expect(paths).toContain('/perioxi/thessaloniki/kalamaria/');
  });

  it("puts each city's dates and areas under the city", () => {
    expect(paths).toContain('/efimeries/larisa/2026-10-07/');
    expect(paths).toContain('/efimeries/larisa/');
    expect(paths).toContain('/en/duty/thessaloniki/');
    expect(paths).toContain('/en/area/larisa/tyrnavos/');
    expect(paths).toContain('/farmakeio/2410672566/');
  });
});

describe('renderSitemap', () => {
  const xml = renderSitemap(sitemapEntries(models), 'https://example.test');

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
    expect((xml.match(/<url>/g) ?? []).length).toBe(sitemapEntries(models).length * 2);
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

describe('breadcrumbJsonLd', () => {
  it('numbers the crumbs from 1 with absolute URLs', () => {
    const crumbs = [
      { name: 'Εφημερίες ανά μέρα', path: '/efimeries/' },
      { name: 'Λάρισα', path: '/efimeries/larisa/' },
    ];
    expect(breadcrumbJsonLd(crumbs, 'https://x.test')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Εφημερίες ανά μέρα',
          item: 'https://x.test/efimeries/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Λάρισα',
          item: 'https://x.test/efimeries/larisa/',
        },
      ],
    });
  });
});

describe('websiteJsonLd', () => {
  it('names the site for the home page of a language', () => {
    expect(websiteJsonLd('Open Pharmacies', 'https://x.test/en/', 'en')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Open Pharmacies',
      url: 'https://x.test/en/',
      inLanguage: 'en',
    });
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
