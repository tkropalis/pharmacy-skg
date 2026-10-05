/** Returns the value, or throws if it is missing. Use where the data guarantees a value. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Missing ${what}`);
  return value;
}
