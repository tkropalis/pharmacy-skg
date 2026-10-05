import { useSyncExternalStore } from 'react';
import { isOnline, onConnectionChange } from '../../lib/connection.ts';

/** Whether the device is online (src/lib/connection.ts), re-rendering when that changes. */
export function useOnline(): boolean {
  return useSyncExternalStore(onConnectionChange, isOnline, () => true);
}
