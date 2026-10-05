/**
 * Greek, the default locale. This file defines the shape of the dictionary: en.ts must have
 * exactly the same keys (enforced by the Dictionary type).
 *
 * The dictionary holds plain strings, arrays and objects only (no functions), so any section
 * can be passed to a React island as props, which Astro serialises.
 */
import { appEl } from './app.el.ts';
import { searchEl } from './search.el.ts';
import { STATUS_LABELS } from './status-labels.ts';

export const el = {
  localeName: 'Ελληνικά',
  /** The two-letter label of the language switch on a phone (its accessible name is localeName). */
  localeCode: 'ΕΛ',
  languageSwitcherLabel: 'Γλώσσα',
  skipToContent: 'Μετάβαση στο περιεχόμενο',
  tagline: 'Δωρεάν και χωρίς διαφημίσεις',

  update: {
    available: 'Νέα έκδοση της εφαρμογής.',
    reload: 'Ανανέωση',
    dismiss: 'Κλείσιμο ειδοποίησης',
  },

  stale: {
    title: 'Οι πληροφορίες μπορεί να είναι παλιές.',
    body: 'Δεν έχουν ενημερωθεί πάνω από μιάμιση μέρα. Καλέστε το φαρμακείο πριν πάτε.',
  },

  status: { ...STATUS_LABELS.el },

  footer: {
    lastUpdatedLabel: 'Ενημερώθηκε',
    navLabel: 'Πληροφορίες',
    disclaimer: 'Καλέστε πριν πάτε.',
    about: 'Σχετικά και αποποίηση ευθύνης',
    aboutShort: 'Σχετικά',
    privacy: 'Απόρρητο',
    report: 'Αναφορά λάθους',
  },

  home: {
    title: 'Ανοιχτά φαρμακεία στη Θεσσαλονίκη',
    description:
      'Ποια φαρμακεία είναι ανοιχτά τώρα στη Θεσσαλονίκη: εφημερεύοντα, διανυκτερεύοντα και όσα έχουν το συνηθισμένο ωράριο, σε χάρτη. Δωρεάν και χωρίς διαφημίσεις.',
    intro:
      'Χάρτης με τα φαρμακεία που είναι ανοιχτά τώρα κοντά σας: εφημερεύοντα, διανυκτερεύοντα και όσα έχουν το συνηθισμένο ωράριο.',
    noScript:
      'Ο χάρτης και η λίστα με τα ανοιχτά φαρμακεία χρειάζονται JavaScript. Χωρίς αυτήν μπορείτε να δείτε τις επίσημες εφημερίες ανά ημέρα:',
    dutyLink: 'Εφημερεύοντα φαρμακεία ανά ημέρα',
    fsthLead: 'Επίσημη πηγή:',
    fsthName: 'Φαρμακευτικός Σύλλογος Θεσσαλονίκης',
  },

  about: {
    title: 'Σχετικά',
    description: 'Τι είναι η εφαρμογή, από πού είναι τα ωράρια και ποιες πηγές χρησιμοποιεί.',
    disclaimer:
      'Καλέστε πριν πάτε: τα ωράρια μπορεί να αλλάξουν ή να έχουν λάθη. Η εφαρμογή δεν δίνει ιατρικές συμβουλές.',
    sections: [
      {
        heading: 'Τι είναι',
        paragraphs: [
          'Δείχνει ποια φαρμακεία του νομού Θεσσαλονίκης είναι ανοιχτά. Είναι δωρεάν, χωρίς διαφημίσεις και ανεξάρτητη: δεν συνδέεται με τον Φαρμακευτικό Σύλλογο Θεσσαλονίκης ή την Περιφέρεια Κεντρικής Μακεδονίας.',
        ],
      },
      {
        heading: 'Ωράρια',
        paragraphs: [
          'Οι εφημερίες είναι μόνο όσες έχουν ανακοινωθεί επίσημα. Τα υπόλοιπα φαρμακεία έχουν το συνηθισμένο ωράριο: Δευτέρα και Τετάρτη 08:00–14:30, Τρίτη, Πέμπτη και Παρασκευή 08:00–14:00 και 17:00–21:00.',
        ],
      },
    ],
    creditsHeading: 'Πηγές',
    credits: {
      fsth: 'Εφημερίες: Φαρμακευτικός Σύλλογος Θεσσαλονίκης, μέσω thess.guide.',
      pkm: 'Ωράρια: Περιφέρεια Κεντρικής Μακεδονίας.',
      overture: 'Θέσεις φαρμακείων: Overture Maps Foundation, CDLA-Permissive-2.0.',
      osm: 'Χάρτης και διευθύνσεις: © συντελεστές OpenStreetMap, ODbL.',
      openFreeMap: 'Πλακίδια χάρτη: OpenFreeMap.',
      fontAwesome: 'Εικονίδια: Font Awesome Free, CC BY 4.0.',
      manrope: 'Γραμματοσειρά: Manrope, SIL OFL 1.1.',
    },
    contact: 'Επικοινωνία:',
    sourceBody: 'Ανοιχτός κώδικας (MIT) στο',
    reportCta: 'Βρήκατε λάθος; Πείτε μας.',
    emergencyHeading: 'Έκτακτη ανάγκη',
    emergencyBody: '166 (ΕΚΑΒ) ή 112. Κέντρο Δηλητηριάσεων: 210 7793777.',
  },

  privacy: {
    title: 'Απόρρητο',
    description:
      'Η τοποθεσία και οι αναζητήσεις σας μένουν στη συσκευή σας. Χωρίς cookies και χωρίς λογαριασμούς.',
    summary:
      'Η τοποθεσία και οι αναζητήσεις σας δεν φεύγουν από τη συσκευή σας. Δεν υπάρχουν λογαριασμοί ούτε cookies.',
    sections: [
      {
        heading: 'Τοποθεσία',
        paragraphs: [
          'Χρησιμοποιείται μόνο στη συσκευή σας, για τις αποστάσεις. Δεν στέλνεται πουθενά και δεν αποθηκεύεται.',
        ],
      },
      {
        heading: 'Αγαπημένα και ρυθμίσεις',
        paragraphs: [
          'Μένουν μόνο στο πρόγραμμα περιήγησής σας και σβήνουν όταν καθαρίσετε τα δεδομένα του ιστότοπου.',
        ],
      },
      {
        heading: 'Στατιστικά',
        paragraphs: [
          'Μετράμε επισκέψεις με το Vercel Web Analytics: ανώνυμα, χωρίς cookies, χωρίς προφίλ.',
        ],
      },
      {
        heading: 'Χάρτης και φιλοξενία',
        paragraphs: [
          'Ο χάρτης φορτώνει από το OpenFreeMap και ο ιστότοπος φιλοξενείται στη Vercel. Όπως κάθε ιστότοπος, βλέπουν τη διεύθυνση IP σας.',
        ],
      },
      {
        heading: 'Αναφορές λάθους',
        paragraphs: ['Γίνονται δημόσια θέματα στο GitHub. Μην γράφετε προσωπικά στοιχεία.'],
      },
    ],
    contact: 'Ερωτήσεις;',
  },

  report: {
    title: 'Αναφορά λάθους',
    description:
      'Λάθος ωράριο, φαρμακείο που βρήκατε κλειστό, λάθος θέση ή τηλέφωνο; Πείτε μας για να το διορθώσουμε.',
    intro: 'Λάθος ωράριο, θέση ή τηλέφωνο; Πείτε μας να το διορθώσουμε.',
    warningTitle: 'Μην γράψετε προσωπικά στοιχεία',
    warningBody: 'Η αναφορά δημοσιεύεται στο GitHub και τη βλέπουν όλοι.',
    form: {
      pharmacyLabel: 'Ποιο φαρμακείο;',
      pharmacyHint: 'Προαιρετικό.',
      typeLabel: 'Τι συμβαίνει;',
      typeOptions: {
        'wrong-hours': 'Λάθος ωράριο',
        'closed-but-listed-open': 'Ήταν κλειστό ενώ εμφανιζόταν ανοιχτό',
        'wrong-location': 'Λάθος θέση στον χάρτη',
        'wrong-phone': 'Λάθος τηλέφωνο',
        other: 'Κάτι άλλο',
      },
      messageLabel: 'Περιγραφή',
      messageHint: 'Έως 1000 χαρακτήρες.',
      characters: 'χαρακτήρες',
      honeypotLabel: 'Μην συμπληρώσετε αυτό το πεδίο',
      submit: 'Αποστολή',
      sending: 'Αποστολή…',
      successTitle: 'Ευχαριστούμε!',
      successBody: 'Η αναφορά στάλθηκε και θα εξεταστεί.',
      viewIssue: 'Δείτε την αναφορά στο GitHub',
      sendAnother: 'Νέα αναφορά',
      errorTitle: 'Δεν στάλθηκε η αναφορά.',
      errorValidation: 'Ελέγξτε τα πεδία και δοκιμάστε ξανά.',
      errorUnavailable: 'Η υπηρεσία αναφορών δεν είναι διαθέσιμη αυτή τη στιγμή.',
      errorNetwork: 'Δεν υπάρχει σύνδεση ή ο διακομιστής δεν απαντά.',
      fallbackBody: 'Μπορείτε να τη στείλετε απευθείας στο GitHub (χρειάζεται λογαριασμός):',
      fallbackLink: 'Άνοιγμα στο GitHub με συμπληρωμένη αναφορά',
      issueTitlePrefix: 'Αναφορά',
      issueNoPharmacy: 'χωρίς φαρμακείο',
      noScript:
        'Η φόρμα χρειάζεται JavaScript. Μπορείτε να ανοίξετε ένα θέμα απευθείας στο GitHub:',
    },
  },

  app: appEl,
  search: searchEl,

  notFound: {
    title: 'Η σελίδα δεν βρέθηκε',
    body: 'Η διεύθυνση που ζητήσατε δεν υπάρχει.',
    homeLink: 'Επιστροφή στην αρχική',
  },

  // Search-engine pages (milestone M3): pharmacy, duty-date and area pages. {name} style
  // placeholders are filled in by lib/seo/format.ts `fill`.
  seo: {
    weekdaysShort: ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'],
    footerDuty: 'Εφημερίες ανά ημέρα',
    footerArea: 'Φαρμακεία ανά περιοχή',
    todayBadge: 'Σήμερα',
    sourceFsth: 'Πηγή: Φαρμακευτικός Σύλλογος Θεσσαλονίκης',
    dataNote:
      'Η σελίδα φτιάχτηκε από τα δεδομένα που φαίνονται παρακάτω. Δείτε την αρχική για την τρέχουσα κατάσταση.',
    breadcrumbLabel: 'Διαδρομή',

    pharmacy: {
      title: '{name} — Φαρμακείο {locality}',
      description:
        'Φαρμακείο {name}, {address}, {locality}. Τηλέφωνο, ωράριο και επίσημες εφημερίες.',
      kicker: 'Φαρμακείο',
      statusHeading: 'Κατάσταση τώρα',
      statusLoading: 'Ελέγχουμε αν είναι ανοιχτό…',
      statusFallback: 'Για να δείτε αν είναι ανοιχτό τώρα, χρειάζεται JavaScript.',
      statusFallbackLink: 'Δείτε αν είναι ανοιχτό στην αρχική σελίδα',
      statusError: 'Δεν φόρτωσαν οι πληροφορίες. Δοκιμάστε ξανά αργότερα ή καλέστε το φαρμακείο.',
      contactHeading: 'Στοιχεία',
      addressLabel: 'Διεύθυνση',
      postcodeLabel: 'Τ.Κ.',
      phoneLabel: 'Τηλέφωνο',
      noPhone: 'Δεν υπάρχει γνωστό τηλέφωνο.',
      areaLabel: 'Περιοχή',
      groupLabel: 'Ομάδα εφημεριών',
      directions: 'Οδηγίες διαδρομής στο Google Maps',
      hoursHeading: 'Ωράριο',
      regularLabel: 'Συνηθισμένο ωράριο',
      regularClosed: 'Κλειστά: {days} και αργίες.',
      regularNote: 'Όταν δεν εφημερεύει και δεν έχει περισσότερες ώρες.',
      extendedHeading: 'Περισσότερες ώρες',
      extendedPeriod: 'Ισχύει από {from} έως {to}',
      extendedAnnouncement: 'Ανακοίνωση της Περιφέρειας Κεντρικής Μακεδονίας',
      extendedNote: 'Τις μέρες που γράφει, ισχύει αντί για το συνηθισμένο ωράριο.',
      dutyHeading: 'Επίσημες εφημερίες',
      dutyIntro: 'Μόνο όσες έχουν ανακοινωθεί.',
      dutyUpcoming: 'Σήμερα και επόμενες',
      dutyRecent: 'Τελευταίες 14 ημέρες',
      dutyNone: 'Δεν υπάρχει δημοσιευμένη εφημερία για αυτό το φαρμακείο στις λίστες που έχουμε.',
      dutyHoursLabel: 'Ώρες:',
      dutyDayPage: 'Λίστα της ημέρας',
      reportLink: 'Αναφορά λάθους για αυτό το φαρμακείο',
      sourcesHeading: 'Πηγές',
      sourcesBody:
        'Εφημερίες: Φαρμακευτικός Σύλλογος Θεσσαλονίκης. Ωράρια: Περιφέρεια Κεντρικής Μακεδονίας. Θέση στον χάρτη: Overture Maps και OpenStreetMap.',
    },

    duty: {
      indexTitle: 'Εφημερεύοντα φαρμακεία Θεσσαλονίκη ανά ημέρα',
      indexDescription:
        'Οι επίσημες λίστες εφημεριών και διανυκτερεύσεων των φαρμακείων της Θεσσαλονίκης ανά ημερομηνία, όπως τις ανακοινώνει ο Φαρμακευτικός Σύλλογος Θεσσαλονίκης.',
      indexIntro:
        'Ποια φαρμακεία εφημερεύουν κάθε μέρα σε όλο τον νομό. Βλέπετε μόνο όσα έχει ανακοινώσει ο Φαρμακευτικός Σύλλογος Θεσσαλονίκης.',
      indexNone: 'Δεν υπάρχουν δημοσιευμένες λίστες αυτή τη στιγμή.',
      indexCounts: '{pharmacies} φαρμακεία',
      missingGroups:
        'Για αυτή τη μέρα δεν έχει ανακοινωθεί ποια φαρμακεία εφημερεύουν σε: {groups}. Κάποιο εκεί μπορεί να εφημερεύει χωρίς να το ξέρουμε. Καλέστε πριν πάτε.',
      pageTitle: 'Εφημερεύοντα φαρμακεία Θεσσαλονίκη — {date}',
      pageDescription:
        'Εφημερεύοντα και διανυκτερεύοντα φαρμακεία της Θεσσαλονίκης για {date}, ανά περιοχή, με ώρες και τηλέφωνα. Πηγή: Φαρμακευτικός Σύλλογος Θεσσαλονίκης.',
      prev: 'Προηγούμενη ημέρα',
      next: 'Επόμενη ημέρα',
      pagerLabel: 'Άλλες ημέρες',
      sourceLine: 'Πηγή: Φαρμακευτικός Σύλλογος Θεσσαλονίκης',
      sourcePdf: 'Λίστα σε PDF',
      uploadedAt: 'Ανέβηκε:',
      hoursLabel: 'Ώρες:',
      hoursNotStated: 'δεν αναφέρονται, καλέστε πριν πάτε',
      nextDay: 'έως την επόμενη ημέρα',
      extraHoursLabel: 'Επιπλέον ώρες:',
      exceptHolidays: 'εκτός αργιών',
      noPharmacyPage: 'Δεν υπάρχει σελίδα για αυτό το φαρμακείο.',
      kinds: {
        day: 'Ημερήσια εφημερία',
        'saturday-extra': 'Επιπλέον Σαββάτου',
        'on-duty': 'Εφημερεύον',
        overnight: 'Διανυκτερεύον',
        'after-midnight': 'Μετά τα μεσάνυχτα',
      },
      onlyPublished:
        'Εμφανίζονται μόνο εφημερίες που έχουν δημοσιευτεί επίσημα. Καλέστε πριν πάτε.',
    },

    area: {
      indexTitle: 'Φαρμακεία ανά περιοχή στη Θεσσαλονίκη',
      indexDescription:
        'Τα φαρμακεία του νομού Θεσσαλονίκης ανά περιοχή, με τα ωράρια και τις επίσημες εφημερίες τους.',
      indexIntro:
        'Διαλέξτε περιοχή για να δείτε τα φαρμακεία της, ποια είναι ανοιχτά σήμερα και πότε εφημερεύουν. Οι περιοχές είναι χωρισμένες σε ομάδες, όπως στις λίστες εφημεριών.',
      otherGroup: 'Λοιπές περιοχές',
      countOne: '1 φαρμακείο',
      countMany: '{count} φαρμακεία',
      pageTitle: 'Φαρμακεία: {area} — ωράριο και εφημερίες',
      pageDescription:
        'Τα {count} φαρμακεία της περιοχής {area}: διεύθυνση, τηλέφωνο, ποια είναι ανοιχτά σήμερα και οι επίσημες εφημερίες.',
      h1: 'Φαρμακεία: {area}',
      groupLabel: 'Ομάδα εφημεριών:',
      openNowHeading: 'Ανοιχτά τώρα',
      openNowLoading: 'Ελέγχουμε…',
      openNowSummary: 'Ανοιχτά τώρα: {open} από {total}.',
      openNowError: 'Δεν φόρτωσαν οι πληροφορίες. Δείτε την αρχική σελίδα ή καλέστε πριν πάτε.',
      openNowNoScript: 'Για να δείτε ποια είναι ανοιχτά τώρα, χρειάζεται JavaScript.',
      closedNow: 'Κλειστό τώρα',
      listHeading: 'Όλα τα φαρμακεία της περιοχής',
      dutyHeading: 'Επίσημες εφημερίες στην περιοχή',
      dutyNone: 'Δεν υπάρχουν δημοσιευμένες εφημερίες για αυτή την περιοχή από σήμερα και μετά.',
      allAreas: 'Όλες οι περιοχές',
    },

    status: {
      openUntil: '{label} μέχρι {when}',
      untilToday: 'τις {time}',
      closingSoon: 'κλείνει σε λίγο',
      closed: 'Κλειστό τώρα.',
      opensAt: 'Ανοίγει {when}.',
      noNextOpen: 'Δεν ξέρουμε πότε ανοίγει τις επόμενες 7 μέρες.',
      unpublished:
        'Δεν έχει ανακοινωθεί ακόμη ποια φαρμακεία εφημερεύουν εδώ αυτή τη μέρα, οπότε αυτό μπορεί να αλλάξει.',
      unpublishedShort: 'δεν ξέρουμε ακόμη αν εφημερεύει',
      loadFailed: 'Δεν φόρτωσαν όλες οι εφημερίες, οπότε αυτό μπορεί να αλλάξει.',
      whenToday: 'σήμερα στις {time}',
      whenTomorrow: 'αύριο στις {time}',
      whenWeekday: '{weekday} στις {time}',
      whenDate: '{date} στις {time}',
      callFirst: 'Καλέστε πριν πάτε.',
      computedAt: 'Ελέγχθηκε στις {time}.',
    },
  },
};
