import type { searchEl } from './search.el.ts';

type Strings<T> = { [K in keyof T]: T[K] extends string ? string : Strings<T[K]> };

/** The medicine search in English: the same keys as search.el.ts. */
export const searchEn: Strings<typeof searchEl> = {
  open: 'Medicines',
  openLabel: 'Medicines: find prices and shortages',
  title: 'Find a medicine',
  close: 'Close',
  inputLabel: 'Medicine name or active substance',
  placeholder: 'e.g. Depon or paracetamol',
  privacy: 'The search happens only on your phone or computer. Nothing is sent anywhere.',
  loading: 'Loading the list of medicines…',
  loadError: 'The list of medicines did not load.',
  loadErrorHint: 'Check your connection and try again.',
  retry: 'Try again',
  hint: 'Type at least two letters of the name.',
  none: 'No medicine found with that name. Try fewer letters.',
  one: '1 medicine found',
  many: '{n} medicines found',
  showing: 'Showing {shown} of {total}',
  showMore: 'Show more',
  resultsLabel: 'Search results',
  maxPrice: 'Maximum price',
  indicativePrice: 'Indicative price',
  shortage: 'Limited availability',

  details: {
    back: 'Back to the results',
    substance: 'Active substance',
    company: 'Company',
    barcode: 'Code on the pack',
    description: 'As written in the price list',
    maxPriceNote:
      'This is the maximum price set by the Ministry of Health, VAT included. It is the same at every pharmacy.',
    prescriptionNote:
      'With a prescription, what you pay depends on your insurance. Your pharmacist will tell you.',
    indicativeNote:
      'No prescription needed. The price is indicative: each pharmacy may charge a different price.',
    notReimbursed: 'According to the price list, insurance does not pay for it.',
    shortageFromTo:
      'The National Organisation for Medicines (ΕΟΦ) lists it as hard to find, from {from} until about {to}.',
    shortageFrom:
      'The National Organisation for Medicines (ΕΟΦ) lists it as hard to find, from {from}.',
    shortageAdvice: 'Ask your pharmacist whether they have it or what else could work.',
    stock: 'We do not know which pharmacies have it. Call the pharmacy before you go.',
    priceSource: 'Price source: Ministry of Health, price list of {date}',
    shortageSource: 'Source: ΕΟΦ, list of {date}',
  },

  /** Credits on the about page, after its own list. */
  credits: {
    moh: 'Medicine prices: Ministry of Health, price lists (medicine search).',
    eof: 'Medicines with limited availability: National Organisation for Medicines (ΕΟΦ).',
  },

  ask: 'Ask your pharmacist. This is information, not medical advice.',
  sources:
    'Prices: Ministry of Health price lists. Shortages: National Organisation for Medicines, list of {date}. The list was updated on {updated}.',

  forms: {
    'F.C.TAB': 'Coated tablets',
    'C.TAB': 'Coated tablets',
    TABLET: 'Tablets',
    TAB: 'Tablets',
    'PR.TAB': 'Slow-release tablets',
    'GR.TAB': 'Gastro-resistant tablets',
    'CHW.TAB': 'Chewable tablets',
    'EF.TAB': 'Effervescent tablets',
    'SOLU.TAB': 'Tablets that dissolve in water',
    'DISP.TAB': 'Tablets that dissolve in water',
    'OR.DISP.TA': 'Tablets that melt in the mouth',
    'SUBL.TAB': 'Tablets for under the tongue',
    CAPS: 'Capsules',
    CAP: 'Capsules',
    'SOFT.CAPS': 'Soft capsules',
    'GR.CAP': 'Gastro-resistant capsules',
    'PR.CAP': 'Slow-release capsules',
    SYR: 'Syrup',
    'ORAL.SOL': 'Oral solution',
    'ORAL.SUSP': 'Oral suspension',
    'EFF.GRAN': 'Effervescent granules',
    'INJ.SOL': 'Solution for injection',
    'INJ.SUSP': 'Suspension for injection',
    'INJ.SO.PFS': 'Injection in a ready-to-use syringe',
    'SOL.INF': 'Solution for a drip',
    'EY.DRO.SOL': 'Eye drops',
    'EY.DRO.SUS': 'Eye drops',
    'NASPR.SOL': 'Nasal spray',
    'NASPR.SUS': 'Nasal spray',
    CREAM: 'Cream',
    OINTMENT: 'Ointment',
    GEL: 'Gel',
    'CUT.SOL': 'Solution for the skin',
    TTS: 'Skin patch',
    SUPP: 'Suppositories',
    'VAG.CR': 'Vaginal cream',
  },
};
