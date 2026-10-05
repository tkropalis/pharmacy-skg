/**
 * Loads data/<city>/ for the build-time pages (the only module here that touches the files).
 * The duty files are loaded lazily, so a build reads only the dates it needs.
 */
import type { DutyDay, ExtendedHours, Pharmacies } from '@pharmacy-skg/core';
import pharmaciesJson from '../../../../../data/thessaloniki/pharmacies.json';
import { DEFAULT_CITY_ID } from '../../config.ts';
import { buildToday } from '../build-today.ts';
import { buildMeta } from '../meta.ts';
import { buildSeoModel, earliestDutyDate } from './model.ts';
import type { SeoModel } from './model.ts';

const dutyFiles = import.meta.glob<DutyDay>('../../../../../data/thessaloniki/duties/*.json', {
  import: 'default',
});
const extendedFiles = import.meta.glob<ExtendedHours>(
  '../../../../../data/thessaloniki/extended-hours/*.json',
  { import: 'default' },
);

const DUTY_NAME = /\/(\d{4}-\d{2}-\d{2})\.json$/;

let model: Promise<SeoModel> | undefined;

async function load(): Promise<SeoModel> {
  const today = buildToday();
  const earliest = earliestDutyDate(today);

  const duties = new Map<string, DutyDay>();
  await Promise.all(
    Object.entries(dutyFiles).map(async ([path, loadFile]) => {
      const date = DUTY_NAME.exec(path)?.[1];
      if (date !== undefined && date >= earliest) duties.set(date, await loadFile());
    }),
  );

  const wanted = new Set(buildMeta.extendedHours.map((entry) => entry.file));
  const extendedHours = await Promise.all(
    Object.entries(extendedFiles)
      .filter(([path]) => [...wanted].some((file) => path.endsWith(`/${file}`)))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, loadFile]) => loadFile()),
  );

  return buildSeoModel({
    cityId: DEFAULT_CITY_ID,
    today,
    updatedAt: buildMeta.updatedAt,
    pharmacies: (pharmaciesJson as Pharmacies).pharmacies,
    duties,
    extendedHours,
  });
}

/** The page model for this build, read once and shared by every page. */
export function loadSeoModel(): Promise<SeoModel> {
  model ??= load();
  return model;
}
