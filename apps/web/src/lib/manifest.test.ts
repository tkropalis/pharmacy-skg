import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_SHORT_NAME } from '../config.ts';
import { manifestPath, webManifest } from './manifest.ts';

describe('webManifest', () => {
  it('is one app in every language, opening on the home screen of its own', () => {
    const el = webManifest('el');
    const en = webManifest('en');
    expect(el).toMatchObject({ id: '/', scope: '/', start_url: '/', lang: 'el' });
    expect(en).toMatchObject({ id: '/', scope: '/', start_url: '/en/', lang: 'en' });
    expect(el['name']).toBe(APP_NAME.el);
    expect(en['short_name']).toBe(APP_SHORT_NAME.en);
  });

  it('is installable: standalone, with a 192 px, a 512 px and a maskable icon', () => {
    const manifest = webManifest('el');
    expect(manifest['display']).toBe('standalone');
    const icons = manifest['icons'] as { sizes: string; purpose: string }[];
    expect(icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
  });

  it('is linked from each locale’s own path', () => {
    expect(manifestPath('el')).toBe('/manifest.webmanifest');
    expect(manifestPath('en')).toBe('/en/manifest.webmanifest');
  });
});
