/**
 * Greek, the default locale. This file defines the shape of the dictionary: en.ts must have
 * exactly the same keys (enforced by the Dictionary type).
 *
 * The dictionary holds plain strings, arrays and objects only (no functions), so any section
 * can be passed to a React island as props, which Astro serialises.
 *
 * Copy rules (docs/decisions.md, Defaults: plain words): as few words as possible, one sentence
 * per warning, no explanations of sources or of how the app works outside the about and privacy
 * pages, no parentheses or abbreviations in labels, and one word for one thing (εφημερία,
 * ανακοινώθηκε, έως, μέρα, τοποθεσία for the person and θέση for a pharmacy on the map).
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
  /** The line under the name on the social-sharing image (scripts/generate-icons.ts). */
  tagline: 'Δωρεάν και χωρίς διαφημίσεις',

  update: {
    available: 'Υπάρχει νέα έκδοση.',
    reload: 'Ανανέωση',
    dismiss: 'Κλείσιμο',
  },

  stale: {
    title: 'Οι πληροφορίες μπορεί να είναι παλιές.',
    body: 'Καλέστε πριν πάτε.',
  },

  status: { ...STATUS_LABELS.el },

  footer: {
    lastUpdatedLabel: 'Ενημερώθηκε',
    offline: 'Εκτός σύνδεσης',
    navLabel: 'Πληροφορίες',
    disclaimer: 'Καλέστε πριν πάτε.',
    aboutShort: 'Σχετικά',
    privacy: 'Απόρρητο',
    report: 'Αναφορά λάθους',
  },

  home: {
    title: 'Ανοιχτά φαρμακεία στη Θεσσαλονίκη',
    description:
      'Ανοιχτά, εφημερεύοντα και διανυκτερεύοντα φαρμακεία της Θεσσαλονίκης τώρα, σε χάρτη. Δωρεάν, χωρίς διαφημίσεις.',
    noScript: 'Ο χάρτης χρειάζεται JavaScript.',
    dutyLink: 'Εφημερίες ανά μέρα',
  },

  about: {
    title: 'Σχετικά',
    description: 'Τι είναι η εφαρμογή και από πού είναι τα δεδομένα.',
    disclaimer:
      'Καλέστε πριν πάτε. Τα ωράρια μπορεί να έχουν λάθη. Η εφαρμογή δεν δίνει ιατρικές συμβουλές.',
    sections: [
      {
        heading: 'Τι είναι',
        paragraphs: [
          'Δείχνει ποια φαρμακεία του νομού Θεσσαλονίκης είναι ανοιχτά. Είναι δωρεάν, χωρίς διαφημίσεις. Δεν συνδέεται με τον Φαρμακευτικό Σύλλογο Θεσσαλονίκης ή την Περιφέρεια Κεντρικής Μακεδονίας.',
        ],
      },
      {
        heading: 'Ωράρια',
        paragraphs: [
          'Δείχνουμε μόνο εφημερίες που έχουν ανακοινωθεί επίσημα. Τα άλλα φαρμακεία έχουν το συνηθισμένο ωράριο: Δευτέρα και Τετάρτη 08:00–14:30, Τρίτη, Πέμπτη και Παρασκευή 08:00–14:00 και 17:00–21:00. Κάποια έχουν περισσότερες ώρες, που ανακοινώνει η Περιφέρεια.',
        ],
      },
    ],
    install: {
      heading: 'Εγκατάσταση',
      body: 'Προσθέστε την εφαρμογή στην αρχική οθόνη. Ανοίγει και χωρίς σύνδεση, με τα δεδομένα της τελευταίας ενημέρωσης.',
      ios: 'Σε iPhone και iPad: στο Safari, Κοινοποίηση και μετά «Προσθήκη στην οθόνη Αφετηρίας».',
      button: 'Εγκατάσταση',
    },
    creditsHeading: 'Πηγές',
    /** Each is followed by its link, labelled with the site's address. */
    credits: {
      fsth: 'Εφημερίες: Φαρμακευτικός Σύλλογος Θεσσαλονίκης, μέσω',
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
    /** "ΕΚΑΒ 166 ή 112. Κέντρο Δηλητηριάσεων 210 7793777.", the numbers as call links. */
    emergencyAmbulance: 'ΕΚΑΒ',
    emergencyOr: 'ή',
    emergencyPoison: 'Κέντρο Δηλητηριάσεων',
  },

  privacy: {
    title: 'Απόρρητο',
    description:
      'Η τοποθεσία και οι αναζητήσεις σας δεν φεύγουν από τη συσκευή σας. Δεν υπάρχουν λογαριασμοί ούτε cookies.',
    summary:
      'Η τοποθεσία και οι αναζητήσεις σας δεν φεύγουν από τη συσκευή σας. Δεν υπάρχουν λογαριασμοί ούτε cookies.',
    sections: [
      {
        heading: 'Τοποθεσία',
        paragraphs: [
          'Χρησιμοποιείται μόνο στη συσκευή σας, για τις αποστάσεις, και δεν στέλνεται πουθενά. Η τελευταία μένει στη συσκευή, κατά προσέγγιση, για να μη ρωτάμε κάθε φορά. Η «Αφαίρεση» τη σβήνει.',
        ],
      },
      {
        heading: 'Αγαπημένα και ρυθμίσεις',
        paragraphs: [
          'Τα αγαπημένα, οι πρόσφατες περιοχές, τα φαρμακεία που ανοίγετε συχνά και οι ρυθμίσεις μένουν μόνο στο πρόγραμμα περιήγησής σας και σβήνουν όταν καθαρίσετε τα δεδομένα του ιστότοπου.',
        ],
      },
      {
        heading: 'Χωρίς σύνδεση',
        paragraphs: [
          'Η εφαρμογή κρατά στη συσκευή τις σελίδες, τα δεδομένα και τα κομμάτια του χάρτη που χρειάζεται για να ανοίγει χωρίς σύνδεση. Όταν είναι εγκατεστημένη, το πρόγραμμα περιήγησης μπορεί να ανανεώνει τα δεδομένα στο παρασκήνιο.',
        ],
      },
      {
        heading: 'Στατιστικά',
        paragraphs: [
          'Μετράμε τις επισκέψεις ανώνυμα και χωρίς cookies, με το Vercel Web Analytics.',
        ],
      },
      {
        heading: 'Χάρτης και φιλοξενία',
        paragraphs: [
          'Ο χάρτης φορτώνει από το OpenFreeMap και ο ιστότοπος φιλοξενείται στη Vercel. Όπως σε κάθε ιστότοπο, βλέπουν τη διεύθυνση IP σας.',
        ],
      },
      {
        heading: 'Αναφορές λάθους',
        paragraphs: ['Δημοσιεύονται στο GitHub. Μη γράφετε προσωπικά στοιχεία.'],
      },
    ],
    contact: 'Ερωτήσεις;',
  },

  report: {
    title: 'Αναφορά λάθους',
    description: 'Λάθος ωράριο, θέση ή τηλέφωνο; Πείτε μας για να το διορθώσουμε.',
    warningTitle: 'Μη γράφετε προσωπικά στοιχεία',
    warningBody: 'Η αναφορά δημοσιεύεται στο GitHub και τη βλέπουν όλοι.',
    form: {
      pharmacyLabel: 'Ποιο φαρμακείο;',
      pharmacyHint: 'Προαιρετικό.',
      typeLabel: 'Τι είναι λάθος;',
      typeOptions: {
        'wrong-hours': 'Λάθος ωράριο',
        'closed-but-listed-open': 'Κλειστό, ενώ έδειχνε ανοιχτό',
        'wrong-location': 'Λάθος θέση στον χάρτη',
        'wrong-phone': 'Λάθος τηλέφωνο',
        other: 'Κάτι άλλο',
      },
      messageLabel: 'Περιγραφή',
      messageHint: 'Έως 1000 χαρακτήρες.',
      characters: 'χαρακτήρες',
      honeypotLabel: 'Μη συμπληρώσετε αυτό το πεδίο',
      submit: 'Αποστολή',
      sending: 'Αποστολή…',
      successTitle: 'Ευχαριστούμε.',
      successBody: 'Η αναφορά στάλθηκε.',
      viewIssue: 'Δείτε την αναφορά στο GitHub',
      sendAnother: 'Νέα αναφορά',
      errorTitle: 'Δεν στάλθηκε η αναφορά.',
      errorValidation: 'Ελέγξτε τα πεδία και δοκιμάστε ξανά.',
      errorUnavailable: 'Δοκιμάστε ξανά αργότερα.',
      errorNetwork: 'Ελέγξτε τη σύνδεση.',
      fallbackBody: 'Ή στείλτε τη στο GitHub, αν έχετε λογαριασμό:',
      fallbackLink: 'Άνοιγμα στο GitHub',
      issueTitlePrefix: 'Αναφορά',
      issueNoPharmacy: 'χωρίς φαρμακείο',
      noScript: 'Η φόρμα χρειάζεται JavaScript. Στείλτε την αναφορά στο',
    },
  },

  app: appEl,
  search: searchEl,

  notFound: {
    title: 'Η σελίδα δεν βρέθηκε',
    /** The page's meta description only: on screen the title says it. */
    body: 'Η διεύθυνση που ζητήσατε δεν υπάρχει.',
    homeLink: 'Αρχική σελίδα',
  },

  // Search-engine pages (milestone M3): pharmacy, duty-date and area pages. {name} style
  // placeholders are filled in by lib/seo/format.ts `fill`.
  seo: {
    weekdaysShort: ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'],
    footerDuty: 'Εφημερίες ανά μέρα',
    footerArea: 'Φαρμακεία ανά περιοχή',
    todayBadge: 'Σήμερα',
    breadcrumbLabel: 'Διαδρομή',

    pharmacy: {
      title: 'Φαρμακείο {name}, {locality}',
      description:
        'Φαρμακείο {name}, {address}, {locality}. Τηλέφωνο, ωράριο και επίσημες εφημερίες.',
      statusHeading: 'Τώρα',
      statusLoading: 'Ελέγχουμε αν είναι ανοιχτό…',
      statusError: 'Δεν φόρτωσε. Καλέστε το φαρμακείο.',
      contactHeading: 'Στοιχεία',
      addressLabel: 'Διεύθυνση',
      call: 'Κλήση {phone}',
      noPhone: 'Χωρίς τηλέφωνο.',
      areaLabel: 'Περιοχή',
      directions: 'Οδηγίες στο Google Maps',
      hoursHeading: 'Ωράριο',
      regularLabel: 'Συνηθισμένο ωράριο',
      regularClosed: 'Κλειστό: {days} και αργίες.',
      extendedHeading: 'Περισσότερες ώρες',
      extendedPeriod: 'Από {from} έως {to}',
      extendedAnnouncement: 'Ανακοίνωση',
      dutyHeading: 'Εφημερίες',
      dutyUpcoming: 'Επόμενες',
      dutyRecent: 'Τελευταίες 14 μέρες',
      dutyNone: 'Δεν έχει ανακοινωθεί εφημερία.',
      reportLink: 'Αναφορά λάθους',
    },

    duty: {
      indexTitle: 'Εφημερεύοντα φαρμακεία ανά μέρα',
      indexDescription:
        'Οι επίσημες λίστες με τα εφημερεύοντα και τα διανυκτερεύοντα φαρμακεία της Θεσσαλονίκης, μέρα με τη μέρα, όπως τις ανακοινώνει ο Φαρμακευτικός Σύλλογος Θεσσαλονίκης.',
      indexIntro: 'Διαλέξτε μέρα.',
      indexNone: 'Δεν υπάρχουν λίστες ακόμη.',
      indexCounts: '{pharmacies} φαρμακεία',
      missingGroups: 'Δεν έχουν ανακοινωθεί ακόμη οι εφημερίες για: {groups}. Καλέστε πριν πάτε.',
      pageTitle: 'Εφημερεύοντα φαρμακεία, {date}',
      pageDescription:
        'Εφημερεύοντα και διανυκτερεύοντα φαρμακεία της Θεσσαλονίκης για {date}, ανά περιοχή, με ώρες και τηλέφωνα. Πηγή: Φαρμακευτικός Σύλλογος Θεσσαλονίκης.',
      prev: 'Προηγούμενη μέρα',
      next: 'Επόμενη μέρα',
      pagerLabel: 'Άλλες μέρες',
      sourcePdf: 'Λίστα σε PDF',
      hoursLabel: 'Ώρες:',
      hoursNotStated: 'καλέστε για το ωράριο',
      nextDay: 'την επομένη',
      extraHoursLabel: 'Επίσης:',
      exceptHolidays: 'εκτός αργιών',
    },

    area: {
      indexTitle: 'Φαρμακεία ανά περιοχή',
      indexDescription:
        'Τα φαρμακεία του νομού Θεσσαλονίκης ανά περιοχή, με τα ωράρια και τις επίσημες εφημερίες τους.',
      indexIntro: 'Διαλέξτε περιοχή.',
      otherGroup: 'Άλλες περιοχές',
      countOne: '1 φαρμακείο',
      countMany: '{count} φαρμακεία',
      pageTitle: 'Φαρμακεία: {area}, ωράριο και εφημερίες',
      pageDescription:
        'Τα {count} φαρμακεία της περιοχής {area}: διεύθυνση, τηλέφωνο, ποια είναι ανοιχτά σήμερα και οι επίσημες εφημερίες.',
      pageDescriptionOne:
        'Το φαρμακείο της περιοχής {area}: διεύθυνση, τηλέφωνο, αν είναι ανοιχτό σήμερα και οι επίσημες εφημερίες.',
      h1: 'Φαρμακεία: {area}',
      openNowHeading: 'Ανοιχτά τώρα',
      openNowSummary: '{open} από {total}.',
      openNowNone: 'Κανένα ανοιχτό.',
      openNowError: 'Δεν φόρτωσε. Καλέστε πριν πάτε.',
      openNowNoScript: 'Χρειάζεται JavaScript.',
      closedNow: 'Κλειστό τώρα',
      listHeading: 'Όλα τα φαρμακεία',
      dutyHeading: 'Εφημερίες',
      dutyNone: 'Δεν έχουν ανακοινωθεί εφημερίες.',
      allAreas: 'Όλες οι περιοχές',
    },

    status: {
      openUntil: '{label} έως {when}',
      untilToday: '{time}',
      closingSoon: 'κλείνει σε λίγο',
      closed: 'Κλειστό τώρα.',
      opensAt: 'Ανοίγει {when}.',
      noNextOpen: 'Δεν ξέρουμε πότε ανοίγει τις επόμενες 7 μέρες.',
      unpublished: 'Οι εφημερίες της μέρας δεν έχουν ανακοινωθεί ακόμη.',
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
