import { STATUS_LABELS } from './status-labels.ts';

/**
 * The home screen's texts (map, list, favourites), in Greek. Placeholders are written {name}
 * and filled by `fill()` in lib/format.ts. Plain strings, arrays and objects only, because
 * the whole section is passed to the page as JSON.
 */
export const appEl = {
  regionLabel: 'Ανοιχτά φαρμακεία: χάρτης και λίστα',
  loading: 'Φόρτωση φαρμακείων…',
  loadError: 'Δεν φορτώθηκαν τα δεδομένα των φαρμακείων.',
  loadErrorHint:
    'Ελέγξτε τη σύνδεσή σας. Αν είχατε ανοίξει ξανά την εφαρμογή, μπορεί να λείπουν δεδομένα.',
  retry: 'Δοκιμάστε ξανά',
  moreDatesFailed:
    'Δεν φορτώθηκαν όλες οι λίστες εφημεριών. Τα αποτελέσματα μπορεί να είναι ελλιπή.',

  tabs: {
    label: 'Προβολή',
    open: 'Ανοιχτά τώρα',
    openAt: 'Ανοιχτά',
    favourites: 'Αγαπημένα',
  },

  sheet: {
    label: 'Λίστα φαρμακείων',
    handleLabel: 'Μέγεθος λίστας: {size}. Πατήστε για αλλαγή.',
    dragHint: 'Σύρετε ή πατήστε για αλλαγή μεγέθους',
    sizes: { small: 'μικρό', medium: 'μεσαίο', large: 'μεγάλο' },
  },

  summary: {
    none: 'Κανένα ανοιχτό φαρμακείο',
    one: '1 ανοιχτό φαρμακείο',
    many: '{n} ανοιχτά φαρμακεία',
    dutyNone: 'Κανένα εφημερεύον φαρμακείο',
    dutyOne: '1 εφημερεύον φαρμακείο',
    dutyMany: '{n} εφημερεύοντα φαρμακεία',
    sortedByDistance: 'κοντινότερα πρώτα, από: {origin}',
    sortedByDistanceShort: 'κοντινότερα πρώτα',
    sortedByName: 'αλφαβητικά',
    withClosed: '+ {n} κλειστά',
  },

  nearby: {
    title: 'Δείτε τα πλησιέστερα',
    area: 'Περιοχή',
  },

  origin: {
    heading: 'Από πού ξεκινάτε;',
    summary: 'Θέση, ώρα και φίλτρα',
    useLocation: 'Χρήση της θέσης μου',
    locating: 'Εντοπισμός θέσης…',
    privacy: 'Η θέση σας μένει στη συσκευή σας και δεν αποστέλλεται πουθενά.',
    denied: 'Δεν επιτράπηκε η πρόσβαση στη θέση σας. Μπορείτε να διαλέξετε περιοχή.',
    deniedShort: 'Η θέση δεν επιτρέπεται.',
    unavailable: 'Δεν βρέθηκε η θέση σας. Μπορείτε να διαλέξετε περιοχή.',
    unsupported: 'Η συσκευή σας δεν δίνει θέση. Μπορείτε να διαλέξετε περιοχή.',
    deniedHelpIos:
      'Για να τη δώσετε: Ρυθμίσεις › Safari › Τοποθεσία (ή μενού aA › Ρυθμίσεις ιστοτόπου).',
    deniedHelpOther:
      'Για να τη δώσετε, επιτρέψτε την τοποθεσία για αυτόν τον ιστότοπο στις ρυθμίσεις του browser.',
    far: 'Βρίσκεστε μακριά από τη Θεσσαλονίκη· οι αποστάσεις μετρούν από τη θέση σας.',
    myLocation: 'Η θέση μου',
    areaName: 'Περιοχή {name}',
    areaLabel: 'Ή διαλέξτε περιοχή',
    areaSearch: 'Αναζήτηση περιοχής',
    areaHint: 'Γράψτε ελληνικά ή λατινικά, π.χ. Καλαμαριά ή kalamaria.',
    areaNone: 'Καμία περιοχή δεν ταιριάζει.',
    areaCount: '{n} περιοχές',
    areaOne: '1 περιοχή',
    areaPharmacies: '{n} φαρμακεία',
    clear: 'Καθαρισμός θέσης',
    current: 'Από: {origin}',
    set: 'Θέση ορίστηκε: {origin}',
    cleared: 'Η θέση καθαρίστηκε',
  },

  time: {
    heading: 'Πότε;',
    now: 'Τώρα',
    other: 'Άλλη ώρα',
    date: 'Ημερομηνία',
    clock: 'Ώρα',
    zoneNote: 'Ώρα Θεσσαλονίκης (Europe/Athens)',
    deviceDiffers:
      'Η συσκευή σας έχει άλλη ζώνη ώρας. Όλες οι ώρες εδώ είναι ώρα Θεσσαλονίκης (Europe/Athens).',
    showing: 'Εμφάνιση για {when} (ώρα Θεσσαλονίκης)',
    dutyNotPublished:
      'Η λίστα εφημεριών για αυτή την ημερομηνία δεν έχει δημοσιευτεί ακόμη. Εμφανίζονται μόνο τα κανονικά και τα διευρυμένα ωράρια.',
    extendedNotPublished:
      'Η λίστα διευρυμένου ωραρίου της ΠΚΜ δεν καλύπτει αυτή την ημερομηνία. Μπορεί να λείπουν φαρμακεία.',
    dutyNotPublishedToday:
      'Η λίστα εφημεριών για σήμερα δεν έχει δημοσιευτεί ή δεν φορτώθηκε. Εμφανίζονται μόνο τα κανονικά και τα διευρυμένα ωράρια.',
    changed: 'Η ώρα άλλαξε: {when}',
    backToNow: 'Επιστροφή στο «Τώρα»',
    loadingDuties: 'Φόρτωση λίστας εφημεριών…',
    groupsMissing:
      'Δεν έχει δημοσιευτεί ακόμη η λίστα εφημεριών για: {groups}. Τα φαρμακεία αυτών των περιοχών φαίνονται ανοιχτά μόνο με το κανονικό ή το διευρυμένο ωράριό τους, ακόμη κι αν εφημερεύουν.',
    groupsMissingOrigin:
      'Δεν έχει δημοσιευτεί ακόμη η λίστα εφημεριών για την περιοχή σας ({group}). Φαρμακεία εκεί μπορεί να εφημερεύουν χωρίς να το γνωρίζουμε. Καλέστε πριν πάτε ή καλέστε το 166 σε έκτακτη ανάγκη.',
  },

  filters: {
    showClosed: 'Εμφάνιση και των κλειστών φαρμακείων',
    legend: 'Τι σημαίνουν τα σημάδια',
  },

  list: {
    label: 'Φαρμακεία',
    filterLabel: 'Φίλτρο λίστας',
    filterAll: 'Όλα τα ανοιχτά ({n})',
    filterDuty: 'Εφημερεύοντα ({n})',
    noDuty: 'Κανένα εφημερεύον φαρμακείο αυτή την ώρα. Δείτε όλα τα ανοιχτά.',
    showMore: 'Εμφάνιση περισσότερων',
    showing: 'Εμφανίζονται {shown} από {total}',
    noneOpen:
      'Κανένα φαρμακείο δεν φαίνεται ανοιχτό αυτή την ώρα. Δοκιμάστε μια άλλη ώρα ή καλέστε το 166 σε έκτακτη ανάγκη.',
    updated: 'Η λίστα ενημερώθηκε: {summary}',
  },

  row: {
    approximate: 'Κατά προσέγγιση θέση (περιοχή, όχι ακριβής διεύθυνση)',
    noLocation: 'Δεν έχει θέση στον χάρτη',
    call: 'Κλήση',
    callLabel: 'Κλήση στο {name}',
    noPhone: 'Χωρίς τηλέφωνο',
    directions: 'Οδηγίες',
    directionsLabel: 'Οδηγίες προς {name}',
    directionsTo: 'Πεζή με',
    google: 'Google Maps',
    apple: 'Apple Maps',
    waze: 'Waze',
    share: 'Κοινοποίηση',
    shareLabel: 'Κοινοποίηση του {name}',
    copied: 'Ο σύνδεσμος αντιγράφηκε',
    copyFailed: 'Δεν έγινε αντιγραφή του συνδέσμου',
    favourite: 'Αγαπημένο',
    favouriteLabel: 'Αγαπημένο: {name}',
    favouriteAdded: '{name}: προστέθηκε στα αγαπημένα',
    favouriteRemoved: '{name}: αφαιρέθηκε από τα αγαπημένα',
    report: 'Αναφορά προβλήματος',
    reportLabel: 'Αναφορά προβλήματος για το {name}',
    showOnMap: 'Εμφάνιση στον χάρτη',
    selected: 'επιλεγμένο',
    dutiesMissing: 'Η λίστα εφημεριών για την περιοχή δεν έχει δημοσιευτεί ακόμη',
    favouriteSaved: 'Αποθηκευμένο',
    favouriteSavedLabel: 'Αποθηκευμένο: {name}',
    shareText: '{name}, {address}',
  },

  status: {
    ...STATUS_LABELS.el,
    closed: 'Κλειστό',
    opensAt: 'ανοίγει {when}',
    opensUnknown: 'δεν γνωρίζουμε πότε ανοίγει',
    closesIn: 'κλείνει σε {duration} ({when})',
    openUntil: 'ανοιχτό έως {when}',
    closingSoon: 'Κλείνει σύντομα',
    today: 'σήμερα',
    tomorrow: 'αύριο',
    hourOne: 'ώρα',
    hourMany: 'ώρες',
    minuteUnit: '′',
    kinds: {
      day: 'διημερεύον',
      'saturday-extra': 'επιπλέον Σαββάτου',
      'on-duty': 'εφημερεύον',
      overnight: 'διανυκτερεύον',
      'after-midnight': 'μεταμεσονύκτιο',
    },
    legend: {
      duty: STATUS_LABELS.el.onDuty,
      regular: STATUS_LABELS.el.openRegular,
      extended: STATUS_LABELS.el.openExtended,
      dutyUnknown: STATUS_LABELS.el.dutyUnknown,
      closed: 'Κλειστό',
      approximate: 'Διακεκομμένο περίγραμμα: θέση κατά προσέγγιση',
    },
  },

  favourites: {
    empty: 'Δεν έχετε αγαπημένα ακόμη.',
    emptyHint: 'Πατήστε «Προσθήκη στα αγαπημένα» σε ένα φαρμακείο για να το βρίσκετε εδώ γρήγορα.',
    deviceOnly: 'Τα αγαπημένα αποθηκεύονται μόνο σε αυτή τη συσκευή.',
    notStored:
      'Δεν μπορέσαμε να αποθηκεύσουμε τα αγαπημένα· θα ισχύουν μόνο μέχρι να κλείσετε τη σελίδα.',
    gone: 'Το φαρμακείο δεν υπάρχει πια στα δεδομένα.',
    upcoming: 'Δημοσιευμένες εφημερίες',
    noneUpcoming: 'Καμία εφημερία στις λίστες που έχουν δημοσιευτεί έως {date}.',
    officialOnly:
      'Εμφανίζονται μόνο εφημερίες που έχει δημοσιεύσει επίσημα ο ΦΣΘ. Δεν κάνουμε προβλέψεις.',
    hoursNotStated: 'ωράριο μη αναγραφόμενο',
    addToCalendar: 'Προσθήκη στο ημερολόγιο',
    addToCalendarLabel: 'Προσθήκη των εφημεριών του {name} στο ημερολόγιο',
    calendarSaved: 'Αποθηκεύτηκε το αρχείο ημερολογίου',
    showAllDuties: 'Όλες οι {n} εφημερίες',
    fewerDuties: 'Λιγότερες',
    loadingDuties: 'Φόρτωση δημοσιευμένων εφημεριών…',
    remove: 'Αφαίρεση',
  },

  ics: {
    summary: 'Εφημερία: {name}',
    source: 'Πηγή: ΦΣΘ',
    callFirst: 'Καλέστε πριν πάτε.',
    calendarName: 'Εφημερίες φαρμακείων',
  },

  source: {
    updated: 'Ενημέρωση',
    short: 'ΦΣΘ (μέσω thess.guide)',
  },

  footer: {
    label: 'Πληροφορίες',
    about: 'Σχετικά',
    privacy: 'Απόρρητο',
    report: 'Αναφορά προβλήματος',
    sources: 'Πηγές',
    disclaimer: 'Καλέστε πριν πάτε. Δεν αποτελεί ιατρική συμβουλή.',
  },

  map: {
    label:
      'Χάρτης με τα φαρμακεία. Είναι προαιρετικός: όλες οι πληροφορίες υπάρχουν και στη λίστα.',
    unavailable: 'Ο χάρτης δεν είναι διαθέσιμος σε αυτή τη συσκευή. Η λίστα λειτουργεί κανονικά.',
    loadFailed: 'Ο χάρτης δεν φορτώθηκε (ίσως δεν υπάρχει σύνδεση). Η λίστα λειτουργεί κανονικά.',
    loading: 'Φόρτωση χάρτη…',
    you: 'Η θέση σας',
    cluster: '{n} φαρμακεία: πατήστε για μεγέθυνση',
    zoomIn: 'Μεγέθυνση',
    zoomOut: 'Σμίκρυνση',
    attribution: 'Χάρτης',
  },
};
