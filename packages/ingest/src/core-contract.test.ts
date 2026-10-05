/**
 * The zod schemas are the source of truth for the published data; the plain types in
 * @pharmacy-skg/core are what the app reads it as. These checks fail to type-check
 * (`pnpm typecheck`) if a schema produces something the core types can't accept.
 */
import type * as core from '@pharmacy-skg/core';
import { DUTY_KINDS as CORE_DUTY_KINDS } from '@pharmacy-skg/core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { DUTY_KINDS } from './fsth/heading.ts';
import type { DutyDaySchema, ExtendedHoursSchema, MetaSchema, PharmaciesSchema } from './schema.ts';

describe('core data types', () => {
  it('accept what the schemas produce', () => {
    expectTypeOf<z.infer<typeof DutyDaySchema>>().toExtend<core.DutyDay>();
    expectTypeOf<z.infer<typeof PharmaciesSchema>>().toExtend<core.Pharmacies>();
    expectTypeOf<z.infer<typeof ExtendedHoursSchema>>().toExtend<core.ExtendedHours>();
    expectTypeOf<z.infer<typeof MetaSchema>>().toExtend<core.Meta>();
  });

  it('share one list of duty kinds', () => {
    expect(DUTY_KINDS).toBe(CORE_DUTY_KINDS);
  });
});
