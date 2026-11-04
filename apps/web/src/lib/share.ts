import type { Locale } from '@pharmacy-skg/core';
import type { Dictionary } from '../i18n/index.ts';
import { pharmacyPath } from '../i18n/routes.ts';
import { fill } from './format.ts';

/**
 * Shares a pharmacy's page: the device's share sheet, or else its address on the clipboard.
 * Returns what to tell the person, or null when the sheet said it all.
 */
export async function sharePharmacy(
  locale: Locale,
  text: Dictionary['app']['row'],
  name: string,
  address: string,
  id: string,
): Promise<string | null> {
  const url = new URL(pharmacyPath(locale, id), window.location.origin).href;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: name, text: fill(text.shareText, { name, address }), url });
      return null;
    } catch (error) {
      // Closing the share sheet is not an error.
      if (error instanceof DOMException && error.name === 'AbortError') return null;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return text.copied;
  } catch {
    return text.copyFailed;
  }
}
