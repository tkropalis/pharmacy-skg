import type { Bounds, City } from './city.ts';

/**
 * The areas whose associations publish their duty lists on ITeQ's platform (decision D26),
 * except Larissa (city.ts), which came first. None has a regular-hours decision the app knows,
 * so each shows only its pharmacies on duty. The centre is the main town; the bounds are where
 * the lists' pharmacies are, with a margin of about 10 km (from data/<id>/, 7 Oct 2026).
 */
function area(
  id: string,
  el: string,
  en: string,
  center: readonly [number, number],
  bounds: Bounds,
  regions?: readonly Bounds[],
): City {
  return {
    id,
    name: { el, en },
    timeZone: 'Europe/Athens',
    center,
    bounds,
    ...(regions ? { regions } : {}),
    defaultGroupId: id,
  };
}

export const ITEQ_AREAS: readonly City[] = [
  area('argolida', 'Αργολίδα', 'Argolida', [22.7279, 37.6333], [22.61, 37.23, 23.37, 37.74]),
  area('arkadia', 'Αρκαδία', 'Arcadia', [22.3729, 37.5101], [21.84, 37.07, 22.98, 37.83]),
  area('arta', 'Άρτα', 'Arta', [20.9851, 39.16], [20.86, 38.97, 21.4, 39.36]),
  area('dodecanese', 'Δωδεκάνησα', 'Dodecanese', [28.2251, 36.434], [26.84, 35.41, 28.35, 36.99]),
  area('drama', 'Δράμα', 'Drama', [24.1469, 41.151], [24.02, 41.05, 24.28, 41.25]),
  // The island and the Chalkida side of the strait, in three boxes: one box around Evia would
  // take in Athens, Thiva and Marathon, and the coast of Fthiotida.
  area(
    'evia',
    'Εύβοια',
    'Evia',
    [23.5973, 38.4631],
    [23.02, 37.92, 24.54, 39.05],
    [
      [23.0, 38.74, 23.75, 39.05],
      [23.45, 38.35, 24.25, 38.74],
      [24.05, 37.95, 24.6, 38.38],
    ],
  ),
  area('evros', 'Έβρος', 'Evros', [25.874, 40.847], [25.71, 40.75, 26.66, 41.6]),
  area('zakynthos', 'Ζάκυνθος', 'Zakynthos', [20.8963, 37.787], [20.76, 37.68, 21.02, 37.88]),
  area('imathia', 'Ημαθία', 'Imathia', [22.2023, 40.5243], [21.94, 40.42, 22.57, 40.73]),
  area('herakleion', 'Ηράκλειο', 'Heraklion', [25.1442, 35.3387], [24.65, 34.92, 25.58, 35.44]),
  area('thesprotia', 'Θεσπρωτία', 'Thesprotia', [20.2668, 39.5062], [20.14, 39.41, 20.39, 39.6]),
  area('ioannina', 'Ιωάννινα', 'Ioannina', [20.8509, 39.665], [20.7, 39.54, 20.99, 39.78]),
  area('kavala', 'Καβάλα', 'Kavala', [24.4121, 40.9369], [24.28, 40.84, 24.54, 41.03]),
  area('karditsa', 'Καρδίτσα', 'Karditsa', [21.921, 39.3652], [21.79, 39.26, 22.09, 39.5]),
  area('kozani', 'Κοζάνη', 'Kozani', [21.7863, 40.3009], [21.55, 40.2, 21.92, 40.61]),
  area('korinthia', 'Κορινθία', 'Corinthia', [22.9302, 37.9393], [22.51, 37.72, 23.26, 38.17]),
  area('lakonia', 'Λακωνία', 'Laconia', [22.4302, 37.0732], [22.19, 36.42, 23.18, 37.27]),
  area('lasithi', 'Λασίθι', 'Lasithi', [25.716, 35.19], [25.49, 34.91, 26.22, 35.36]),
  area('magnesia', 'Μαγνησία', 'Magnesia', [22.944, 39.362], [22.8, 39.23, 23.09, 39.48]),
  area('messinia', 'Μεσσηνία', 'Messinia', [22.1142, 37.0389], [21.47, 36.71, 22.4, 37.38]),
  area('xanthi', 'Ξάνθη', 'Xanthi', [24.8873, 41.1349], [24.76, 41.03, 25.02, 41.24]),
  // Piraeus, Salamina, Aegina and Poros with Galatas, each its own box: one box around them all
  // would take in Athens, Kallithea and Elefsina, which are other associations'.
  area(
    'piraeus',
    'Πειραιάς',
    'Piraeus',
    [23.647, 37.942],
    [23.33, 37.4, 23.78, 38.08],
    [
      // Piraeus, Nikaia and Korydallos to the north edge of Korydallos: Agia Varvara and Aigaleo,
      // just north, are Attica's.
      [23.55, 37.92, 23.695, 37.986],
      [23.4, 37.86, 23.56, 38.0],
      [23.4, 37.67, 23.57, 37.79],
      [23.35, 37.45, 23.55, 37.55],
    ],
  ),
  area('pella', 'Πέλλα', 'Pella', [22.0443, 40.8001], [21.92, 40.59, 22.54, 41.07]),
  area('pieria', 'Πιερία', 'Pieria', [22.5029, 40.2713], [22.36, 39.9, 22.74, 40.59]),
  area('preveza', 'Πρέβεζα', 'Preveza', [20.7519, 38.9592], [20.63, 38.86, 20.87, 39.06]),
  area('samos', 'Σάμος', 'Samos', [26.9751, 37.7548], [26.58, 37.65, 27.14, 37.89]),
  area('tinos', 'Τήνος', 'Tinos', [25.163, 37.538], [25.04, 37.44, 25.28, 37.63]),
  area('trikala', 'Τρίκαλα', 'Trikala', [21.7679, 39.5551], [21.64, 39.45, 21.89, 39.65]),
  area('fthiotida', 'Φθιώτιδα', 'Fthiotida', [22.4338, 38.8999], [22, 38.56, 23.17, 39.04]),
  area('chania', 'Χανιά', 'Chania', [24.018, 35.5138], [23.54, 35.13, 24.22, 35.65]),
];
