/**
 * Corfu's pages print an address, not a place: "ΜΙΛΤΙΑΔΟΥ ΜΑΡΓΑΡΙΤΗ 8" is in the town, "ΒΡΥΩΝΗ" is a
 * village, "ΕΘΝΙΚΗ ΠΑΛΑΙΟΚΑΣΤΡΙΤΣΑΣ 183 - ΓΑΡΔΕΛΑΔΕΣ" a street in one. A pharmacy's place is the
 * first village from this list that its address names, written out as people write it; any other
 * address is the town's. Capitals cannot be turned into the right accents by rule, so the
 * villages are listed (as in iteq/places.ts); one not listed makes the pharmacy the town's, and
 * the pipeline reports an address with neither a number nor a place (`unnamed-place`).
 */
import { matchKey } from '../text.ts';

export const TOWN = 'Κέρκυρα';

/** Printed (no accents, as `matchKey` writes them) to written out. */
const PLACES: Readonly<Record<string, string>> = {
  'ΑΓ ΜΑΡΚΟΣ': 'Άγιος Μάρκος',
  'ΑΓ ΙΩΑΝΝΗΣ': 'Άγιος Ιωάννης',
  'ΑΓΙΟΙ ΘΕΟΔΩΡΟΙ': 'Άγιοι Θεόδωροι',
  'ΑΓΙΟΣ ΑΘΑΝΑΣΙΟΣ': 'Άγιος Αθανάσιος',
  'ΑΓΙΟΣ ΜΑΤΘΑΙΟΣ': 'Άγιος Ματθαίος',
  ΑΓΡΑΦΟΙ: 'Άγραφοι',
  ΑΓΡΟΣ: 'Άγρος',
  ΑΛΕΠΟΥ: 'Αλεπού',
  'ΑΝΩ ΠΥΡΓΙ': 'Άνω Πύργι',
  ΑΡΓΥΡΑΔΕΣ: 'Αργυράδες',
  ΑΡΙΛΛΑΣ: 'Αρίλλας',
  ΑΥΛΙΩΤΕΣ: 'Αυλιώτες',
  ΑΧΑΡΑΒΗ: 'Αχαράβη',
  ΒΡΥΩΝΗ: 'Βρυώνη',
  ΒΥΡΟΣ: 'Βύρος',
  ΓΑΡΔΕΛΑΔΕΣ: 'Γαρδελάδες',
  ΓΟΥΒΙΑ: 'Γούβια',
  ΔΑΣΙΑ: 'Δασιά',
  ΔΟΥΚΑΔΕΣ: 'Δουκάδες',
  ΚΑΝΑΛΙΑ: 'Κανάλια',
  ΚΑΡΟΥΣΑΔΕΣ: 'Καρουσάδες',
  ΚΑΣΣΙΩΠΗ: 'Κασσιώπη',
  'ΚΑΤΩ ΓΑΡΟΥΝΑ': 'Κάτω Γαρούνα',
  ΚΕΦΑΛΟΒΡΥΣΟ: 'Κεφαλόβρυσο',
  ΚΟΚΚΙΝΙ: 'Κοκκίνι',
  ΚΟΜΠΙΤΣΙ: 'Κομπίτσι',
  ΚΟΝΤΟΚΑΛΙ: 'Κοντόκαλι',
  ΛΑΚΚΑ: 'Λάκκα',
  ΛΕΥΚΙΜΜΗ: 'Λευκίμμη',
  ΛΙΑΠΑΔΕΣ: 'Λιαπάδες',
  'ΛΙΝΙΑ ΧΛΩΜΟΥ': 'Χλωμός',
  ΜΗΛΙΑ: 'Μηλιά',
  ΜΠΕΝΙΤΣΕΣ: 'Μπενίτσες',
  ΜΩΡΑΪΤΙΚΑ: 'Μωραΐτικα',
  ΠΑΞΟΙ: 'Παξοί',
  ΠΕΛΕΚΑΣ: 'Πελεκάς',
  ΠΕΡΑΜΑ: 'Πέραμα',
  ΠΕΡΙΒΟΛΙΟΥ: 'Περιβόλι',
  ΠΕΡΟΥΛΑΔΩΝ: 'Περουλάδες',
  ΠΕΤΡΙΤΗ: 'Πετρίτη',
  ΡΙΓΓΛΑΔΕΣ: 'Ρίγγλαδες',
  ΡΟΔΑ: 'Ρόδα',
  ΣΙΔΑΡΙ: 'Σιδάρι',
  ΣΙΝΑΡΑΔΕΣ: 'Σιναράδες',
  ΣΚΡΙΠΕΡΟ: 'Σκριπερό',
  ΤΡΙΚΛΙΝΟ: 'Τρίκλινο',
  ΤΖΑΒΡΟΣ: 'Τζαβρός',
  ΤΡΙΣΤΡΑΤΟ: 'Τρίστρατο',
  ΧΛΩΜΟΤΙΑΝΑ: 'Χλωμοτιανά',
  ΧΩΡΕΠΙΣΚΟΠΟΙ: 'Χωρεπίσκοποι',
};

const KEYED = Object.entries(PLACES).map(
  ([printed, written]) => [new RegExp(`(?:^| )${matchKey(printed)}(?: |$)`), written] as const,
);

/**
 * The place of an address: the village it names, else the town. `known` is false for an address
 * that names no village and has no house number, which may be a village not listed.
 */
export function corfuPlace(address: string): { place: string; known: boolean } {
  const key = matchKey(address);
  let best: { index: number; place: string } | undefined;
  for (const [pattern, place] of KEYED) {
    const index = key.search(pattern);
    if (index >= 0 && (best === undefined || index < best.index)) best = { index, place };
  }
  if (best) return { place: best.place, known: true };
  return { place: TOWN, known: /\d/.test(key) };
}
