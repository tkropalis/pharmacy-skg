import { describe, expect, it, vi } from 'vitest';
import { importOrOfferReload } from './import-or-reload.ts';

describe('importOrOfferReload', () => {
  it('returns the module and offers nothing when the import works', async () => {
    const offer = vi.fn();
    await expect(importOrOfferReload(() => Promise.resolve({ ok: true }), offer)).resolves.toEqual({
      ok: true,
    });
    expect(offer).not.toHaveBeenCalled();
  });

  it('offers the reload and rethrows when the chunk cannot be fetched', async () => {
    const offer = vi.fn();
    const failure = new TypeError('Failed to fetch dynamically imported module');
    await expect(importOrOfferReload(() => Promise.reject(failure), offer)).rejects.toBe(failure);
    expect(offer).toHaveBeenCalledOnce();
  });
});
