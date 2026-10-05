import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { describe, expect, it } from 'vitest';
import { faDataUrl, faPath, faSvg } from './fa.ts';

describe('Font Awesome helpers', () => {
  it('draw the icon from its own path, at the requested size', () => {
    const { width, height, d } = faPath(faPlus);
    const svg = faSvg(faPlus, { size: 20, className: 'x' });
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    expect(svg).toContain('width="20" height="20"');
    expect(svg).toContain(`d="${d}"`);
    expect(svg).toContain('aria-hidden="true"');
  });
  it('makes a CSS url', () => {
    expect(faDataUrl(faPlus, '#000')).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
  });
});
