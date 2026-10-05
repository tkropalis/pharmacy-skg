/**
 * The medicine search (decision D24). Its own file, so the search's lazy chunk imports only
 * these strings and not the whole dictionary. search.en.ts must have the same keys.
 */
export const searchEl = {
  /** The header button (visible text) and its accessible name, which starts with it (WCAG 2.5.3). */
  open: 'Φάρμακα',
  openLabel: 'Φάρμακα: αναζήτηση',
  /** The dialog's name (not shown). */
  title: 'Αναζήτηση φαρμάκου',
  close: 'Κλείσιμο',
  /** The field's name (not shown: the placeholder says it). */
  inputLabel: 'Όνομα φαρμάκου',
  placeholder: 'Όνομα φαρμάκου, π.χ. Depon',
  loading: 'Φόρτωση…',
  loadError: 'Δεν φόρτωσε. Ελέγξτε τη σύνδεση.',
  retry: 'Δοκιμάστε ξανά',
  hint: 'Γράψτε τουλάχιστον δύο γράμματα.',
  none: 'Δεν βρέθηκε φάρμακο.',
  one: '1 φάρμακο',
  many: '{n} φάρμακα',
  showMore: 'Περισσότερα',
  resultsLabel: 'Αποτελέσματα',
  maxPrice: 'Ανώτατη τιμή',
  indicativePrice: 'Ενδεικτική τιμή',
  shortage: 'Δύσκολα βρίσκεται',

  details: {
    back: 'Πίσω',
    substance: 'Δραστική ουσία',
    company: 'Εταιρεία',
    maxPriceNote: 'Ίδια σε όλα τα φαρμακεία.',
    indicativeNote: 'Μπορεί να διαφέρει από φαρμακείο σε φαρμακείο.',
    notReimbursed: 'Δεν το καλύπτει η ασφάλιση.',
    shortageUntil: 'Έως περίπου {to}.',
    shortageAdvice: 'Ρωτήστε τον φαρμακοποιό για κάτι αντίστοιχο.',
  },

  /** Credits on the about page, after its own list. */
  credits: {
    moh: 'Τιμές φαρμάκων: Υπουργείο Υγείας.',
    eof: 'Φάρμακα που δύσκολα βρίσκονται: Εθνικός Οργανισμός Φαρμάκων.',
  },

  /**
   * Plain words for the form codes of the bulletins (the most common ones). A code that is not
   * here is not explained; the description as printed is always shown too.
   */
  forms: {
    'F.C.TAB': 'Επικαλυμμένα δισκία',
    'C.TAB': 'Επικαλυμμένα δισκία',
    TABLET: 'Δισκία',
    TAB: 'Δισκία',
    'PR.TAB': 'Δισκία παρατεταμένης δράσης',
    'GR.TAB': 'Γαστροανθεκτικά δισκία',
    'CHW.TAB': 'Μασώμενα δισκία',
    'EF.TAB': 'Αναβράζοντα δισκία',
    'SOLU.TAB': 'Δισκία που διαλύονται στο νερό',
    'DISP.TAB': 'Δισκία που διαλύονται στο νερό',
    'OR.DISP.TA': 'Δισκία που λιώνουν στο στόμα',
    'SUBL.TAB': 'Δισκία κάτω από τη γλώσσα',
    CAPS: 'Καψάκια',
    CAP: 'Καψάκια',
    'SOFT.CAPS': 'Μαλακά καψάκια',
    'GR.CAP': 'Γαστροανθεκτικά καψάκια',
    'PR.CAP': 'Καψάκια παρατεταμένης δράσης',
    SYR: 'Σιρόπι',
    'ORAL.SOL': 'Πόσιμο διάλυμα',
    'ORAL.SUSP': 'Πόσιμο εναιώρημα',
    'EFF.GRAN': 'Αναβράζοντα κοκκία',
    'GRA.SACHET': 'Κοκκία σε φακελάκια',
    'INJ.SOL': 'Ενέσιμο διάλυμα',
    'INJ.SUSP': 'Ενέσιμο εναιώρημα',
    'INJ.SO.PFS': 'Ένεση σε έτοιμη σύριγγα',
    'SOL.INF': 'Διάλυμα για ορό',
    'EY.DRO.SOL': 'Οφθαλμικές σταγόνες',
    'EY.DRO.SUS': 'Οφθαλμικές σταγόνες',
    'NASPR.SOL': 'Ρινικό σπρέι',
    'NASPR.SUS': 'Ρινικό σπρέι',
    CREAM: 'Κρέμα',
    OINTMENT: 'Αλοιφή',
    GEL: 'Τζελ',
    'CUT.SOL': 'Διάλυμα για το δέρμα',
    TTS: 'Έμπλαστρο για το δέρμα',
    SUPP: 'Υπόθετα',
    'VAG.CR': 'Κολπική κρέμα',
  },
};
