/**
 * The published data format (data/<city>/). These schemas are the contract
 * with the app: the pipeline validates every file against them before it
 * writes, and `pnpm --filter @pharmacy-skg/ingest schema` exports them as JSON
 * Schema to data/schema/.
 */
import { z } from 'zod';
import { DUTY_KINDS } from './fsth/heading.ts';

export const SCHEMA_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const isoDateTime = z.iso.datetime({ offset: true });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

export const TimeWindowSchema = z
  .object({ from: time, to: time, toNextDay: z.boolean() })
  .describe('Local time (Europe/Athens). toNextDay: ends after midnight, including at 00:00.');

export const ExtraHoursSchema = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).describe('ISO weekdays, 1 = Monday'),
  from: time,
  to: time,
  exceptHolidays: z.boolean(),
});

export const DutyEntrySchema = z.object({
  pharmacyId: z.string(),
  name: z.string().min(1).describe('As printed in the ΦΣΘ list'),
  address: z.string(),
  locality: z.string().min(1),
  phone: z.string().describe('As printed; normally 10 digits'),
});

export const DutySectionSchema = z.object({
  kind: z.enum(DUTY_KINDS),
  heading: z.string().describe('As printed'),
  hours: TimeWindowSchema.nullable().describe('From the heading; null when it states none'),
  extraHours: z.array(ExtraHoursSchema),
  notes: z.array(z.string()),
  entries: z.array(DutyEntrySchema).min(1),
});

export const DutySourceSchema = z.object({
  url: z.url(),
  uploadedAt: isoDateTime.describe('When the file appeared at the URL'),
});

export const DutyGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: DutySourceSchema,
  sections: z.array(DutySectionSchema).min(1),
});

/** data/<city>/duties/<date>.json — the officially published duty lists for one day. */
export const DutyDaySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  date: isoDate,
  groups: z.array(DutyGroupSchema),
});

export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  source: z.enum(['override', 'overture', 'nominatim']),
  precision: z
    .enum(['exact', 'street', 'locality'])
    .describe('exact: the building or the pharmacy itself; street/locality: approximate'),
  ref: z.string().optional().describe('Id or query in the source, for tracing'),
});

export const PharmacySchema = z.object({
  id: z.string().regex(/^(\d{10}|x-[0-9a-f]{10})$/),
  name: z.string().min(1),
  address: z.string(),
  locality: z.string(),
  postcode: z.string().nullable(),
  phone: z
    .string()
    .regex(/^\d{10}$/)
    .nullable(),
  groupId: z.string().nullable().describe('ΦΣΘ area group; null if never seen in a duty list'),
  location: LocationSchema.nullable(),
  sources: z.array(z.enum(['fsth', 'pkm'])).min(1),
  firstSeen: isoDate,
  lastSeen: isoDate,
});

/** data/<city>/pharmacies.json — every pharmacy found in an official list. */
export const PharmaciesSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  pharmacies: z.array(PharmacySchema),
});

export const TimeRangeSchema = z.object({ from: time, to: time });

export const ScheduleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('weekly'),
    days: z.record(z.string().regex(/^[1-7]$/), z.array(TimeRangeSchema)),
  }),
  z.object({ type: z.literal('dates'), dates: z.record(isoDate, z.array(TimeRangeSchema)) }),
]);

export const ExtendedHoursEntrySchema = z.object({
  pharmacyId: z.string(),
  name: z.string(),
  address: z.string(),
  postcode: z.string(),
  area: z.string(),
  schedule: ScheduleSchema,
  scheduleText: z.string().describe('As published'),
});

/** data/<city>/extended-hours/<from>_<to>.json — the ΠΚΜ list for one period. */
export const ExtendedHoursSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  period: z.object({ from: isoDate, to: isoDate }),
  title: z.string().describe('Title of the ΠΚΜ announcement'),
  announcementUrl: z.url(),
  source: DutySourceSchema,
  entries: z.array(ExtendedHoursEntrySchema),
});

export const SourceCreditSchema = z.object({
  id: z.string(),
  name: z.record(z.enum(['el', 'en']), z.string()),
  url: z.url(),
  note: z.string().optional(),
});

/** data/<city>/meta.json — freshness and credits. */
export const MetaSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  city: z.string(),
  updatedAt: isoDateTime.describe('When the data last changed'),
  duties: z.object({ from: isoDate, to: isoDate }).nullable(),
  extendedHours: z.array(z.object({ from: isoDate, to: isoDate, file: z.string() })),
  sources: z.array(SourceCreditSchema),
});

export type DutyDay = z.infer<typeof DutyDaySchema>;
export type DutyGroup = z.infer<typeof DutyGroupSchema>;
export type DutyEntryRecord = z.infer<typeof DutyEntrySchema>;
export type Pharmacy = z.infer<typeof PharmacySchema>;
export type Location = z.infer<typeof LocationSchema>;
export type ExtendedHours = z.infer<typeof ExtendedHoursSchema>;
export type Meta = z.infer<typeof MetaSchema>;

export const SCHEMAS = {
  'duty-day': DutyDaySchema,
  pharmacies: PharmaciesSchema,
  'extended-hours': ExtendedHoursSchema,
  meta: MetaSchema,
} as const;
