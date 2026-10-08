/**
 * The areas on ITeQ's platform besides Larissa (docs/research-greece.md, section 2; D26). Each
 * site publishes the whole area's list as one, and its cards print the village or neighbourhood,
 * so each area is one duty group. None has a regular-hours decision the app knows: the app shows
 * only their pharmacies on duty.
 *
 * Each is credited as its site names itself on 7 Oct 2026: the association where the site says
 * so, otherwise the site's own title. Left out: Rethymno, Rodopi and Kefalonia publish nothing,
 * and Attica's site (fsa-efimeries.gr) has its own format (cities/attiki.ts).
 */
import type { City } from '@pharmacy-skg/core';
import { ITEQ_AREAS } from '@pharmacy-skg/core';
import type { Meta } from '../schema.ts';
import { iteqPipeline } from './iteq.ts';
import type { CityPipeline, ValidationRules } from './pipeline.ts';

interface Publisher {
  /** The site's host name (`<host>.efhmeries.gr`). */
  readonly host: string;
  /** The genitive in the site's name: "Φαρμακευτικός Σύλλογος Πειραιά". */
  readonly el: string;
  /** "Piraeus", as in "Pharmaceutical Association of Piraeus". */
  readonly en: string;
  /** Whether the site names the association (otherwise it is credited by its own title). */
  readonly association: boolean;
}

const PUBLISHERS: Readonly<Record<string, Publisher>> = {
  argolida: { host: 'argolida', el: 'Αργολίδας', en: 'Argolida', association: false },
  arkadia: { host: 'arkadia', el: 'Αρκαδίας', en: 'Arcadia', association: true },
  arta: { host: 'arta', el: 'Άρτας', en: 'Arta', association: false },
  chania: { host: 'chania', el: 'Χανίων', en: 'Chania', association: true },
  dodecanese: { host: 'dodecanese', el: 'Δωδεκανήσου', en: 'the Dodecanese', association: true },
  drama: { host: 'drama', el: 'Δράμας', en: 'Drama', association: false },
  evia: { host: 'evia', el: 'Ευβοίας', en: 'Evia', association: true },
  evros: { host: 'evros', el: 'Έβρου', en: 'Evros', association: true },
  fthiotida: { host: 'fthiotida', el: 'Φθιώτιδας', en: 'Fthiotida', association: true },
  herakleion: { host: 'herakleion', el: 'Ηρακλείου', en: 'Heraklion', association: true },
  imathia: { host: 'imathia', el: 'Ημαθίας', en: 'Imathia', association: false },
  ioannina: { host: 'ioannina', el: 'Ιωαννίνων', en: 'Ioannina', association: false },
  karditsa: { host: 'karditsa', el: 'Καρδίτσας', en: 'Karditsa', association: true },
  kavala: { host: 'kavala', el: 'Καβάλας', en: 'Kavala', association: false },
  korinthia: { host: 'korinthia', el: 'Κορινθίας', en: 'Corinthia', association: true },
  kozani: { host: 'kozani', el: 'Κοζάνης', en: 'Kozani', association: false },
  lakonia: { host: 'lakonia', el: 'Λακωνίας', en: 'Laconia', association: false },
  lasithi: { host: 'lasithi', el: 'Λασιθίου', en: 'Lasithi', association: true },
  magnesia: { host: 'magnesia', el: 'Μαγνησίας', en: 'Magnesia', association: false },
  messinia: { host: 'messinia', el: 'Μεσσηνίας', en: 'Messinia', association: true },
  pella: { host: 'pella', el: 'Πέλλας', en: 'Pella', association: true },
  pieria: { host: 'pieria', el: 'Πιερίας', en: 'Pieria', association: true },
  piraeus: { host: 'piraeus', el: 'Πειραιά', en: 'Piraeus', association: true },
  preveza: {
    host: 'preveza',
    el: 'Πρέβεζας Λευκάδας',
    en: 'Preveza and Lefkada',
    association: false,
  },
  samos: { host: 'samos', el: 'Σάμου', en: 'Samos', association: false },
  thesprotia: { host: 'thesprotia', el: 'Θεσπρωτίας', en: 'Thesprotia', association: false },
  // The Cyclades site lists only Tinos.
  tinos: { host: 'cyclades', el: 'Κυκλάδων', en: 'the Cyclades', association: false },
  trikala: { host: 'trikala', el: 'Τρικάλων', en: 'Trikala', association: true },
  xanthi: { host: 'xanthi', el: 'Ξάνθης', en: 'Xanthi', association: true },
  zakynthos: { host: 'zakynthos', el: 'Ζακύνθου', en: 'Zakynthos', association: true },
};

function credit(city: City, publisher: Publisher): Meta['sources'][number] {
  const host = `${publisher.host}.efhmeries.gr`;
  return {
    id: `iteq-${city.id}`,
    name: publisher.association
      ? {
          el: `Φαρμακευτικός Σύλλογος ${publisher.el}`,
          en: `Pharmaceutical Association of ${publisher.en}`,
        }
      : { el: `Εφημερίες φαρμακείων ${publisher.el}`, en: `Pharmacy duties of ${publisher.en}` },
    url: `https://${host}/`,
    note: `Duty lists, from ${host}`,
  };
}

/**
 * Loose checks, the same for every area: a list must be there today and tomorrow, and no
 * section may be empty or absurdly long. The areas differ too much (one pharmacy a day in
 * Preveza, thirty in the Dodecanese) for tighter ranges before a few weeks of data.
 */
function rules(city: City): ValidationRules {
  return {
    groupIds: [city.defaultGroupId],
    sectionRange: () => [1, 80],
    pharmacies: [1, 2000],
    minExtendedEntries: null,
  };
}

export const ITEQ_PIPELINES: readonly CityPipeline[] = ITEQ_AREAS.map((city) => {
  const publisher = PUBLISHERS[city.id];
  if (!publisher) throw new Error(`No ITeQ site for ${city.id}`);
  return iteqPipeline({
    city,
    host: `${publisher.host}.efhmeries.gr`,
    association: credit(city, publisher),
    rules: rules(city),
  });
});
