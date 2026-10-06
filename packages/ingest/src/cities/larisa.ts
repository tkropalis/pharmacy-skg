/**
 * The Larissa regional unit: duty lists from the Φαρμακευτικός Σύλλογος Λάρισας, on ITeQ's
 * platform. Larissa has no published regular-hours decision (docs/research-greece.md), so the
 * app shows only its pharmacies on duty (decision D26).
 */
import { LARISA } from '@pharmacy-skg/core';
import { iteqPipeline } from './iteq.ts';

/** The sectors as the site's form lists them (its values 1 to 9). */
const SECTORS = [
  { id: 'larisa', printed: 'ΛΑΡΙΣΑ', name: 'Λάρισα' },
  { id: 'tyrnavos', printed: 'ΤΥΡΝΑΒΟΣ', name: 'Τύρναβος' },
  { id: 'agia', printed: 'ΑΓΙΑ', name: 'Αγιά' },
  { id: 'ampelonas', printed: 'ΑΜΠΕΛΩΝΑΣ', name: 'Αμπελώνας' },
  { id: 'elassona', printed: 'ΕΛΑΣΣΟΝΑ', name: 'Ελασσόνα' },
  { id: 'farsala', printed: 'ΦΑΡΣΑΛΑ', name: 'Φάρσαλα' },
  { id: 'giannouli', printed: 'ΓΙΑΝΝΟΥΛΗ', name: 'Γιάννουλη' },
  { id: 'falani', printed: 'ΦΑΛΑΝΗ', name: 'Φαλάνη' },
  { id: 'nikaia', printed: 'ΝΙΚΑΙΑ', name: 'Νίκαια' },
] as const;

/**
 * Entries per section, from the lists of 6–12 Oct 2026: in the city, 6–8 on day duty, one
 * overnight and about 25 on Saturday mornings; in each other sector one or two a day (up to
 * five on Saturday mornings in Elassona).
 */
const CITY_RANGES = {
  day: [2, 20],
  'saturday-extra': [5, 60],
  'on-duty': [1, 10],
  overnight: [1, 5],
  'after-midnight': [1, 5],
} as const;
const SECTOR_RANGE = [1, 10] as const;

export const larisa = iteqPipeline({
  city: LARISA,
  host: 'larisa.efhmeries.gr',
  association: {
    id: 'fsl',
    name: { el: 'Φαρμακευτικός Σύλλογος Λάρισας', en: 'Pharmaceutical Association of Larissa' },
    url: 'https://www.fslarisas.gr/',
    note: 'Duty lists, from its duty site larisa.efhmeries.gr',
  },
  sectors: SECTORS,
  rules: {
    groupIds: SECTORS.map((sector) => sector.id),
    sectionRange: (groupId, kind) => (groupId === 'larisa' ? CITY_RANGES[kind] : SECTOR_RANGE),
    // Only pharmacies seen on duty are known: a few weeks of lists name most of the ~250.
    pharmacies: [10, 400],
    minExtendedEntries: null,
  },
});
