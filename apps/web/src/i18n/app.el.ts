import { DUTY_KIND_LABELS, STATUS_LABELS } from './status-labels.ts';

/**
 * The home screen's texts (map, list, favourites), in Greek. Placeholders are written {name}
 * and filled by `fill()` in lib/format.ts. Plain strings, arrays and objects only, because
 * the whole section is passed to the page as JSON. The copy rules are in el.ts.
 */
export const appEl = {
  regionLabel: 'Ανοιχτά φαρμακεία: χάρτης και λίστα',
  loading: 'Φόρτωση φαρμακείων…',
  loadError: 'Δεν φόρτωσαν τα φαρμακεία.',
  loadErrorHint: 'Ελέγξτε τη σύνδεση.',
  retry: 'Δοκιμάστε ξανά',
  /** Every close (×) button on the home screen. */
  close: 'Κλείσιμο',
  /** Announced when a pharmacy is tapped on the map. */
  chosen: 'Επιλέχθηκε: {name}',
  moreDatesFailed: 'Δεν φόρτωσαν όλες οι εφημερίες. Μπορεί να λείπουν φαρμακεία.',

  tabs: {
    label: 'Προβολή',
    open: 'Ανοιχτά τώρα',
    openAt: 'Ανοιχτά',
    favourites: 'Αγαπημένα',
  },

  sheet: {
    label: 'Λίστα φαρμακείων',
    handleLabel: 'Μέγεθος λίστας: {size}. Πατήστε για αλλαγή.',
    sizes: { small: 'μικρό', medium: 'μεσαίο', large: 'μεγάλο' },
  },

  /** The status line under the tabs, joined with " · ": "12 ανοιχτά · 3 κλειστά". */
  summary: {
    none: 'Κανένα ανοιχτό',
    one: '1 ανοιχτό',
    many: '{n} ανοιχτά',
    dutyNone: 'Κανένα δεν εφημερεύει',
    dutyOne: '1 εφημερεύει',
    dutyMany: '{n} εφημερεύουν',
    sortedByDistance: 'πρώτα τα πιο κοντινά, αποστάσεις από: {origin}',
    sortedByName: 'αλφαβητικά',
    withClosed: '{n} κλειστά',
    withClosedOne: '1 κλειστό',
  },

  nearby: {
    title: 'Κοντά σας',
  },

  origin: {
    heading: 'Πού βρίσκεστε;',
    summary: 'Επιλογές',
    useLocation: 'Η τοποθεσία μου',
    locating: 'Εντοπισμός…',
    deniedShort: 'Η τοποθεσία δεν επιτρέπεται.',
    unavailable: 'Δεν βρέθηκε η τοποθεσία σας. Διαλέξτε περιοχή.',
    deniedHelpIos: 'Ρυθμίσεις › Εφαρμογές › Safari › Τοποθεσία.',
    deniedHelpOther: 'Αλλάξτε το στις ρυθμίσεις.',
    far: 'Είστε μακριά από τη Θεσσαλονίκη.',
    myLocation: 'Κοντά μου',
    here: 'Η τοποθεσία σας',
    /** The position remembered from an earlier visit (the chip, and "distances from"). */
    lastLocation: 'Τελευταία τοποθεσία',
    lastHere: 'Η τελευταία τοποθεσία σας',
    /** Areas chosen recently, first in the area picker. */
    areaRecent: 'Πρόσφατες',
    areaName: 'Κοντά σε: {name}',
    areaLabel: 'Περιοχή',
    areaSearch: 'Γράψτε την περιοχή',
    areaHint: 'π.χ. Καλαμαριά',
    areaNone: 'Δεν βρέθηκε περιοχή.',
    areaCount: '{n} περιοχές',
    areaOne: '1 περιοχή',
    areaPharmacies: '{n} φαρμακεία',
    areaPharmacy: '1 φαρμακείο',
    clear: 'Αφαίρεση',
    current: 'Αποστάσεις από: {origin}',
    cleared: 'Η τοποθεσία αφαιρέθηκε',
  },

  time: {
    heading: 'Για πότε;',
    now: 'Τώρα',
    other: 'Άλλη μέρα ή ώρα',
    date: 'Μέρα',
    clock: 'Ώρα',
    deviceDiffers: 'Ώρα Ελλάδας.',
    showing: 'Ανοιχτά: {when}',
    dutyNotPublished: 'Οι εφημερίες αυτής της μέρας δεν έχουν ανακοινωθεί ακόμη.',
    extendedNotPublished: 'Μπορεί να λείπουν κάποια φαρμακεία αυτή τη μέρα.',
    dutyNotPublishedToday: 'Δεν βρέθηκαν οι σημερινές εφημερίες. Καλέστε πριν πάτε.',
    dutyOffline: 'Οι εφημερίες αυτής της μέρας δεν είναι στη συσκευή. Ελέγξτε τη σύνδεση.',
    dutyOfflineToday: 'Οι σημερινές εφημερίες δεν είναι στη συσκευή. Ελέγξτε τη σύνδεση.',
    backToNow: 'Πίσω στο τώρα',
    loadingDuties: 'Φόρτωση εφημεριών…',
    groupsMissing: 'Δεν έχουν ανακοινωθεί ακόμη οι εφημερίες για: {groups}.',
    groupsMissingOrigin:
      'Δεν έχουν ανακοινωθεί ακόμη οι εφημερίες για την περιοχή σας, {group}. Καλέστε πριν πάτε.',
  },

  filters: {
    showClosed: 'Εμφάνιση κλειστών',
    legend: 'Τι σημαίνουν τα σύμβολα',
  },

  list: {
    label: 'Φαρμακεία',
    filterLabel: 'Ποια να φαίνονται',
    filterAll: 'Όλα',
    filterDuty: 'Εφημερεύοντα',
    noDuty: 'Κανένα δεν εφημερεύει αυτή την ώρα.',
    showMore: 'Περισσότερα',
    noneOpen: 'Κανένα ανοιχτό φαρμακείο αυτή την ώρα. Σε έκτακτη ανάγκη: 166.',
    updated: 'Η λίστα ενημερώθηκε: {summary}',
  },

  /**
   * A pharmacy in the list. Accessible names read "Label: {name}": the names are surnames in the
   * nominative, which an article ("στο", "του") would not agree with.
   */
  row: {
    approximate: 'Θέση κατά προσέγγιση.',
    noLocation: 'Δεν φαίνεται στον χάρτη.',
    call: 'Κλήση',
    callLabel: 'Κλήση: {name}',
    noPhone: 'Χωρίς τηλέφωνο.',
    directions: 'Οδηγίες',
    directionsLabel: 'Οδηγίες: {name}',
    google: 'Google Maps',
    apple: 'Apple Maps',
    waze: 'Waze',
    share: 'Κοινοποίηση',
    shareLabel: 'Κοινοποίηση: {name}',
    copied: 'Ο σύνδεσμος αντιγράφηκε',
    copyFailed: 'Ο σύνδεσμος δεν αντιγράφηκε',
    favourite: 'Αγαπημένο',
    favouriteLabel: 'Αγαπημένο: {name}',
    favouriteAdded: '{name}: προστέθηκε στα αγαπημένα',
    favouriteRemoved: '{name}: αφαιρέθηκε από τα αγαπημένα',
    /** The link to the pharmacy's own page, where its hours and duty days are. */
    page: 'Ωράριο',
    defaultLocality: 'Θεσσαλονίκη',
    dutiesMissing: 'Δεν ξέρουμε ακόμη αν εφημερεύει',
    favouriteSaved: 'Στα αγαπημένα',
    favouriteSavedLabel: 'Στα αγαπημένα: {name}',
    shareText: '{name}, {address}',
  },

  status: {
    ...STATUS_LABELS.el,
    closed: 'Κλειστό',
    opensAt: 'ανοίγει {when}',
    opensUnknown: 'δεν ξέρουμε πότε ανοίγει',
    closesIn: '{label} έως {when}, κλείνει σε {duration}',
    openUntil: '{label} έως {when}',
    allNight: '{label} όλη τη νύχτα',
    today: 'σήμερα',
    tomorrow: 'αύριο',
    hourOne: 'ώρα',
    hourMany: 'ώρες',
    minuteOne: 'λεπτό',
    minuteMany: 'λεπτά',
    short: {
      duty: 'Εφημερεύει',
      regular: 'Ανοιχτό',
      extended: 'Ανοιχτό',
      'duty-unknown': 'Εφημερεύει',
      closed: 'Κλειστό',
      until: 'έως {when}',
      closesIn: 'κλείνει σε {duration}',
      callFirst: 'καλέστε για το ωράριο',
    },
    /** The kinds of duty, shared with the search-engine pages. */
    kinds: { ...DUTY_KIND_LABELS.el },
    legend: {
      duty: 'Εφημερεύει',
      regular: 'Ανοιχτό, συνηθισμένο ωράριο',
      extended: 'Ανοιχτό, περισσότερες ώρες από τα άλλα',
      dutyUnknown: 'Εφημερεύει, καλέστε για το ωράριο',
      closed: 'Κλειστό',
      approximate: 'Διακεκομμένη γραμμή: θέση κατά προσέγγιση',
    },
  },

  favourites: {
    empty: 'Κανένα αγαπημένο ακόμη.',
    /** The pharmacies the person opens most (counted on the device only). */
    frequent: 'Ανοίγετε συχνά',
    emptyHint: 'Ανοίξτε ένα φαρμακείο και πατήστε «Αγαπημένο».',
    notStored: 'Τα αγαπημένα δεν θα αποθηκευτούν.',
    gone: 'Αυτό το φαρμακείο δεν υπάρχει πια.',
    upcoming: 'Επόμενες εφημερίες',
    noneUpcoming: 'Δεν έχει ανακοινωθεί εφημερία έως {date}.',
    noneAnnounced: 'Δεν έχει ανακοινωθεί εφημερία.',
    hoursNotStated: 'καλέστε για το ωράριο',
    addToCalendar: 'Προσθήκη στο ημερολόγιο',
    addToCalendarLabel: 'Προσθήκη στο ημερολόγιο: {name}',
    calendarSaved: 'Το αρχείο ημερολογίου κατέβηκε.',
    showAllDuties: 'Όλες οι {n} εφημερίες',
    fewerDuties: 'Λιγότερες',
    loadingDuties: 'Φόρτωση εφημεριών…',
    remove: 'Αφαίρεση',
  },

  /** Calendar files (lib/ics.ts): the event text, not shown on screen. */
  ics: {
    summary: 'Εφημερία: {name}',
    source: 'Πηγή: Φαρμακευτικός Σύλλογος Θεσσαλονίκης',
    callFirst: 'Καλέστε πριν πάτε.',
    calendarName: 'Εφημερίες φαρμακείων',
  },

  source: {
    tiny: 'Ενημερώθηκε',
    offline: 'Εκτός σύνδεσης',
  },

  footer: {
    emergency: 'Έκτακτη ανάγκη:',
    poison: 'Κέντρο Δηλητηριάσεων',
    label: 'Πληροφορίες',
    about: 'Σχετικά',
    privacy: 'Απόρρητο',
    report: 'Αναφορά λάθους',
    install: 'Εγκατάσταση',
    disclaimer: 'Καλέστε πριν πάτε.',
  },

  map: {
    label: 'Χάρτης φαρμακείων. Όλα υπάρχουν και στη λίστα.',
    unavailable: 'Ο χάρτης δεν ανοίγει σε αυτή τη συσκευή.',
    loadFailed: 'Ο χάρτης δεν φόρτωσε.',
    loading: 'Φόρτωση χάρτη…',
    you: 'Η τοποθεσία σας',
    cluster: '{n} φαρμακεία: πατήστε για να τα δείτε',
    zoomIn: 'Μεγέθυνση',
    zoomOut: 'Σμίκρυνση',
  },
};
