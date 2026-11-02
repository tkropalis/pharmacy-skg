import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutOf, shortcutUrl } from './shortcuts.ts';

describe('shortcuts', () => {
  it('are addresses of the home screen in each language', () => {
    expect(shortcutUrl('el', 'duty')).toBe('/?show=duty');
    expect(shortcutUrl('en', 'favourites')).toBe('/en/?show=favourites');
  });

  it('are read back from the address they made', () => {
    for (const shortcut of SHORTCUTS) {
      for (const locale of ['el', 'en'] as const) {
        const search = shortcutUrl(locale, shortcut).split('?')[1] ?? '';
        expect(shortcutOf(`?${search}`)).toBe(shortcut);
      }
    }
  });

  it('ignore anything else', () => {
    expect(shortcutOf('')).toBeNull();
    expect(shortcutOf('?show=closed')).toBeNull();
    expect(shortcutOf('?show=')).toBeNull();
    expect(shortcutOf('?utm_source=x')).toBeNull();
    expect(shortcutOf('?show=duty&utm_source=x')).toBe('duty');
  });
});
