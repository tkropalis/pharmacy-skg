/**
 * Loads data/<city>/ for the build-time pages (the only module here that touches the files).
 * The files are loaded lazily, so a build reads only the city and the dates it needs.
 */
import type { DutyDay, ExtendedHours, Pharmacies } from '@pharmacy-skg/core';
import { CITIES } from '@pharmacy-skg/core';
import { buildToday } from '../build-today.ts';
import { buildMetaFor } from '../meta.ts';
import { buildSeoModel, earliestDutyDate } from './model.ts';
import type { SeoModel } from './model.ts';

const DATA = '../../../../../data/';
const pharmacyFiles = import.meta.glob<Pharmacies>('../../../../../data/*/pharmacies.json', {
  import: 'default',
});
const dutyFiles = import.meta.glob<DutyDay>('../../../../../data/*/duties/*.json', {
  import: 'default',
});
const extendedFiles = import.meta.glob<ExtendedHours>(
  '../../../../../data/*/extended-hours/*.json',
  { import: 'default' },
);

const DUTY_NAME = /\/(\d{4}-\d{2}-\d{2})\.json$/;

const models = new Map<string, Promise<SeoModel>>();

async function load(cityId: string): Promise<SeoModel> {
  const root = `${DATA}${cityId}/`;
  const loadPharmacies = pharmacyFiles[`${root}pharmacies.json`];
  if (loadPharmacies === undefined) throw new Error(`No data/${cityId}/pharmacies.json`);
  const meta = buildMetaFor(cityId);
  const today = buildToday();
  const earliest = earliestDutyDate(today);

  const duties = new Map<string, DutyDay>();
  await Promise.all(
    Object.entries(dutyFiles)
      .filter(([path]) => path.startsWith(`${root}duties/`))
      .map(async ([path, loadFile]) => {
        const date = DUTY_NAME.exec(path)?.[1];
        if (date !== undefined && date >= earliest) duties.set(date, await loadFile());
      }),
  );

  const wanted = new Set(meta.extendedHours.map((entry) => `${root}${entry.file}`));
  const extendedHours = await Promise.all(
    Object.entries(extendedFiles)
      .filter(([path]) => wanted.has(path))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, loadFile]) => loadFile()),
  );

  return buildSeoModel({
    cityId,
    today,
    updatedAt: meta.updatedAt,
    dutySource: meta.sources[0]?.name ?? {},
    pharmacies: (await loadPharmacies()).pharmacies,
    duties,
    extendedHours,
  });
}

/** A city's page model for this build, read once and shared by every page. */
export function loadSeoModel(cityId: string): Promise<SeoModel> {
  let model = models.get(cityId);
  if (model === undefined) {
    model = load(cityId);
    models.set(cityId, model);
  }
  return model;
}

/** Every shown city's page model, in the order of CITIES. */
export function loadSeoModels(): Promise<SeoModel[]> {
  return Promise.all(CITIES.map((city) => loadSeoModel(city.id)));
}
