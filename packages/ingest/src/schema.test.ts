import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SCHEMAS, TimeRangeSchema, TimeWindowSchema } from './schema.ts';
import { REPO_ROOT, toJson } from './store.ts';

describe('data/schema', () => {
  it.each(Object.entries(SCHEMAS))('%s.schema.json is up to date', async (name, schema) => {
    const committed = await readFile(
      join(REPO_ROOT, 'data', 'schema', `${name}.schema.json`),
      'utf8',
    );
    expect(committed, 'run: pnpm --filter @pharmacy-skg/ingest schema').toBe(
      toJson(z.toJSONSchema(schema, { io: 'output' })),
    );
  });
});

describe('time sanity', () => {
  const dutyWindow = (hours: unknown) => TimeWindowSchema.safeParse(hours).success;
  const range = (from: string, to: string) => TimeRangeSchema.safeParse({ from, to }).success;

  it('requires a range to end after it starts, or at 00:00', () => {
    expect(range('08:00', '14:30')).toBe(true);
    expect(range('18:00', '00:00')).toBe(true);
    expect(range('14:00', '14:00')).toBe(false);
    expect(range('21:00', '08:30')).toBe(false);
    expect(range('00:00', '00:00')).toBe(false);
  });

  it('requires a window that stays in the day to end after it starts', () => {
    expect(dutyWindow({ from: '08:00', to: '21:00', toNextDay: false })).toBe(true);
    expect(dutyWindow({ from: '21:00', to: '08:00', toNextDay: true })).toBe(true);
    expect(dutyWindow({ from: '21:00', to: '00:00', toNextDay: true })).toBe(true);
    expect(dutyWindow({ from: '21:00', to: '08:00', toNextDay: false })).toBe(false);
    expect(dutyWindow({ from: '14:00', to: '14:00', toNextDay: false })).toBe(false);
  });
});
