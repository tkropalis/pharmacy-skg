/** The area groups ΦΣΘ publishes a separate duty list for. The id is our stable key. */
export interface AreaGroup {
  readonly id: string;
  /** The name exactly as printed on the first line of the PDF. */
  readonly name: string;
}

export const AREA_GROUPS: readonly AreaGroup[] = [
  { id: 'metro', name: 'Πολεοδομικό Συγκρότημα Θεσσαλονίκης' },
  { id: 'lagkadas', name: 'Δήμος Λαγκαδά' },
  { id: 'chalkidona', name: 'Δήμος Χαλκηδόνας' },
  { id: 'oraiokastro', name: 'Δήμος Ωραιοκάστρου' },
  { id: 'thermi', name: 'Δήμος Θέρμης' },
  { id: 'thermaikos', name: 'Δήμος Θερμαϊκού' },
  { id: 'volvi', name: 'Δήμος Βόλβης' },
  { id: 'delta', name: 'Δήμος Δέλτα' },
  { id: 'panorama-pefka', name: 'Πανόραμα-Πεύκα' },
  { id: 'asvestochori', name: 'Ασβεστοχώρι/Εξοχή-Χορτιάτης-Φίλυρο' },
];

export function findAreaGroup(printedName: string): AreaGroup | undefined {
  const name = printedName.replace(/\s+/g, ' ').trim();
  return AREA_GROUPS.find((group) => group.name === name);
}
