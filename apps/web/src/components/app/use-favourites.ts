import { useCallback, useEffect, useState } from 'react';
import {
  FAVOURITES_KEY,
  loadFavourites,
  saveFavourites,
  toggleFavourite,
} from '../../lib/favourites.ts';

export interface FavouritesApi {
  readonly ids: readonly string[];
  /** Returns the new state of this pharmacy: true when it is now a favourite. */
  readonly toggle: (id: string) => boolean;
  /** False when localStorage refused the last write; the list then lasts for this visit. */
  readonly persisted: boolean;
}

export function useFavourites(): FavouritesApi {
  const [ids, setIds] = useState<readonly string[]>([]);
  const [persisted, setPersisted] = useState(true);

  // Read after hydration, and follow changes made in another tab.
  useEffect(() => {
    setIds(loadFavourites());
    const onStorage = (event: StorageEvent) => {
      if (event.key === FAVOURITES_KEY || event.key === null) setIds(loadFavourites());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const next = toggleFavourite(ids, id);
      setIds(next);
      setPersisted(saveFavourites(next));
      return next.includes(id);
    },
    [ids],
  );

  return { ids, toggle, persisted };
}
