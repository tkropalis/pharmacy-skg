import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FAVOURITES_KEY,
  loadFavourites,
  saveFavourites,
  toggleFavourite,
} from '../../lib/favourites.ts';
import type { Favourite } from '../../lib/favourites.ts';

export interface FavouritesApi {
  /** Every favourite, with its city. */
  readonly favourites: readonly Favourite[];
  /** Every favourite's pharmacy id. */
  readonly ids: readonly string[];
  /** Returns the new state of this pharmacy: true when it is now a favourite. */
  readonly toggle: (id: string, cityId: string) => boolean;
  /** False when localStorage refused the last write; the list then lasts for this visit. */
  readonly persisted: boolean;
}

export function useFavourites(): FavouritesApi {
  const [favourites, setFavourites] = useState<readonly Favourite[]>([]);
  const [persisted, setPersisted] = useState(true);

  // Read after hydration, and follow changes made in another tab.
  useEffect(() => {
    setFavourites(loadFavourites());
    const onStorage = (event: StorageEvent) => {
      if (event.key === FAVOURITES_KEY || event.key === null) setFavourites(loadFavourites());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback(
    (id: string, cityId: string) => {
      const next = toggleFavourite(favourites, { id, cityId });
      setFavourites(next);
      setPersisted(saveFavourites(next));
      return next.some((f) => f.id === id);
    },
    [favourites],
  );

  const ids = useMemo(() => favourites.map((f) => f.id), [favourites]);
  return { favourites, ids, toggle, persisted };
}
