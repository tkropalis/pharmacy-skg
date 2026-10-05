/**
 * Runs a dynamic import. If it fails, `offer` is called (the "new version" notice with its
 * reload button) and the error is rethrown for the caller to handle.
 *
 * After a deploy the service worker drops the old version's hashed chunks, so a page that was
 * already open can no longer fetch a chunk it has not loaded yet. Retrying cannot help (the
 * browser remembers the failed import); loading the new version does.
 */
export async function importOrOfferReload<T>(
  load: () => Promise<T>,
  offer: () => void,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    offer();
    throw error;
  }
}
