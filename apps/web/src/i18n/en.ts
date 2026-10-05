import { appEn } from './app.en.ts';
import { searchEn } from './search.en.ts';
import { STATUS_LABELS } from './status-labels.ts';
import type { Dictionary } from './index.ts';

export const en: Dictionary = {
  localeName: 'English',
  localeCode: 'EN',
  languageSwitcherLabel: 'Language',
  skipToContent: 'Skip to content',
  tagline: 'Free and ad-free',

  update: {
    available: 'A new version of the app is ready.',
    reload: 'Reload',
    dismiss: 'Dismiss notice',
  },

  stale: {
    title: 'This information may be out of date.',
    body: 'It has not been updated for more than a day and a half. Call the pharmacy before you go.',
  },

  status: { ...STATUS_LABELS.en },

  footer: {
    lastUpdatedLabel: 'Updated',
    navLabel: 'Information',
    disclaimer: 'Call before you go.',
    about: 'About and disclaimer',
    aboutShort: 'About',
    privacy: 'Privacy',
    report: 'Report a mistake',
  },

  home: {
    title: 'Open pharmacies in Thessaloniki',
    description:
      'Which pharmacies are open right now in Thessaloniki: on duty, overnight and on their usual hours, on a map. Free and ad-free.',
    intro:
      'A map of the pharmacies that are open right now near you: on duty, overnight and on their usual hours.',
    noScript:
      'The map and the list of open pharmacies need JavaScript. Without it you can see the official duty lists by day:',
    dutyLink: 'Pharmacies on duty, by day',
    fsthLead: 'Official source:',
    fsthName: 'Pharmaceutical Association of Thessaloniki',
  },

  about: {
    title: 'About',
    description: 'What the app is, where the opening hours come from and which sources it uses.',
    disclaimer:
      'Call before you go: opening hours can change or contain mistakes. This app does not give medical advice.',
    sections: [
      {
        heading: 'What it is',
        paragraphs: [
          'It shows which pharmacies in the Thessaloniki regional unit are open. It is free, ad-free and independent: it has no connection with the Pharmaceutical Association of Thessaloniki or the Region of Central Macedonia.',
        ],
      },
      {
        heading: 'Opening hours',
        paragraphs: [
          'Duty pharmacies are only those officially announced. Every other pharmacy has the usual hours: Monday and Wednesday 08:00–14:30, Tuesday, Thursday and Friday 08:00–14:00 and 17:00–21:00.',
        ],
      },
    ],
    creditsHeading: 'Sources',
    credits: {
      fsth: 'Duty lists: Pharmaceutical Association of Thessaloniki, via thess.guide.',
      pkm: 'Opening hours: Region of Central Macedonia.',
      overture: 'Pharmacy locations: Overture Maps Foundation, CDLA-Permissive-2.0.',
      osm: 'Map and addresses: © OpenStreetMap contributors, ODbL.',
      openFreeMap: 'Map tiles: OpenFreeMap.',
      fontAwesome: 'Icons: Font Awesome Free, CC BY 4.0.',
      manrope: 'Typeface: Manrope, SIL OFL 1.1.',
    },
    contact: 'Contact:',
    sourceBody: 'Open source (MIT) on',
    reportCta: 'Found a mistake? Tell us.',
    emergencyHeading: 'Emergency',
    emergencyBody: '166 (ambulance) or 112. Poison Centre: 210 7793777.',
  },

  privacy: {
    title: 'Privacy',
    description: 'Your location and searches stay on your device. No cookies and no accounts.',
    summary:
      'Your location and searches never leave your device. There are no accounts and no cookies.',
    sections: [
      {
        heading: 'Location',
        paragraphs: [
          'It is used only on your device, to work out distances. It is not sent anywhere and not stored.',
        ],
      },
      {
        heading: 'Favourites and settings',
        paragraphs: [
          'They stay only in your browser and are deleted when you clear the site’s data.',
        ],
      },
      {
        heading: 'Statistics',
        paragraphs: [
          'We count visits with Vercel Web Analytics: anonymous, no cookies, no profiles.',
        ],
      },
      {
        heading: 'Map and hosting',
        paragraphs: [
          'The map loads from OpenFreeMap and the site is hosted on Vercel. Like any website, they see your IP address.',
        ],
      },
      {
        heading: 'Problem reports',
        paragraphs: ['They become public issues on GitHub. Do not include personal information.'],
      },
    ],
    contact: 'Questions?',
  },

  report: {
    title: 'Report a mistake',
    description:
      'Wrong hours, a pharmacy you found closed, a wrong location or phone? Tell us so we can fix it.',
    intro: 'Wrong hours, location or phone number? Tell us so we can fix it.',
    warningTitle: 'Do not include personal information',
    warningBody: 'Reports are published on GitHub for anyone to read.',
    form: {
      pharmacyLabel: 'Which pharmacy?',
      pharmacyHint: 'Optional.',
      typeLabel: 'What is wrong?',
      typeOptions: {
        'wrong-hours': 'Wrong opening hours',
        'closed-but-listed-open': 'It was closed but listed as open',
        'wrong-location': 'Wrong location on the map',
        'wrong-phone': 'Wrong phone number',
        other: 'Something else',
      },
      messageLabel: 'Description',
      messageHint: 'Up to 1000 characters.',
      characters: 'characters',
      honeypotLabel: 'Leave this field empty',
      submit: 'Send',
      sending: 'Sending…',
      successTitle: 'Thank you!',
      successBody: 'Your report was sent and will be reviewed.',
      viewIssue: 'View the report on GitHub',
      sendAnother: 'Send another report',
      errorTitle: 'The report was not sent.',
      errorValidation: 'Check the fields and try again.',
      errorUnavailable: 'The reporting service is not available right now.',
      errorNetwork: 'You are offline or the server is not responding.',
      fallbackBody: 'You can send it straight to GitHub instead (an account is needed):',
      fallbackLink: 'Open GitHub with the report filled in',
      issueTitlePrefix: 'Report',
      issueNoPharmacy: 'no pharmacy',
      noScript: 'The form needs JavaScript. You can open an issue on GitHub directly:',
    },
  },

  app: appEn,
  search: searchEn,

  notFound: {
    title: 'Page not found',
    body: 'The address you asked for does not exist.',
    homeLink: 'Back to the home page',
  },

  // Search-engine pages (milestone M3): pharmacy, duty-date and area pages. {name} style
  // placeholders are filled in by lib/seo/format.ts `fill`.
  seo: {
    weekdaysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    footerDuty: 'Duty lists by date',
    footerArea: 'Pharmacies by area',
    todayBadge: 'Today',
    sourceFsth: 'Source: Pharmaceutical Association of Thessaloniki',
    dataNote:
      'This page was built from the data shown below. See the home page for the current status.',
    breadcrumbLabel: 'Breadcrumb',

    pharmacy: {
      title: '{name} — Pharmacy in {locality}',
      description:
        'Pharmacy {name}, {address}, {locality}. Phone, opening hours and official duty days.',
      kicker: 'Pharmacy',
      statusHeading: 'Status now',
      statusLoading: 'Checking if it is open…',
      statusFallback: 'To see if it is open now, JavaScript is needed.',
      statusFallbackLink: 'See if it is open on the home page',
      statusError: 'The information did not load. Try again later or call the pharmacy.',
      contactHeading: 'Details',
      addressLabel: 'Address',
      postcodeLabel: 'Postcode',
      phoneLabel: 'Phone',
      noPhone: 'No phone number is known.',
      areaLabel: 'Area',
      groupLabel: 'Duty group',
      directions: 'Directions in Google Maps',
      hoursHeading: 'Opening hours',
      regularLabel: 'Usual hours',
      regularClosed: 'Closed: {days} and public holidays.',
      regularNote: 'When it is not on duty and has no longer hours.',
      extendedHeading: 'Longer hours',
      extendedPeriod: 'In force from {from} to {to}',
      extendedAnnouncement: 'Announcement by the Region of Central Macedonia',
      extendedNote: 'On the days it lists, it replaces the usual hours.',
      dutyHeading: 'Official duty dates',
      dutyIntro: 'Only those officially announced.',
      dutyUpcoming: 'Today and upcoming',
      dutyRecent: 'Last 14 days',
      dutyNone: 'No published duty date for this pharmacy in the lists we have.',
      dutyHoursLabel: 'Hours:',
      dutyDayPage: 'Full list for the day',
      reportLink: 'Report a mistake about this pharmacy',
      sourcesHeading: 'Sources',
      sourcesBody:
        'Duty days: Pharmaceutical Association of Thessaloniki. Opening hours: Region of Central Macedonia. Location on the map: Overture Maps and OpenStreetMap.',
    },

    duty: {
      indexTitle: 'On-duty pharmacies in Thessaloniki by date',
      indexDescription:
        'The official on-duty and overnight pharmacy lists for Thessaloniki by date, as announced by the Pharmaceutical Association of Thessaloniki.',
      indexIntro:
        'Which pharmacies are on duty each day across the regional unit. You only see what the Pharmaceutical Association of Thessaloniki has announced.',
      indexNone: 'No published lists at the moment.',
      indexCounts: '{pharmacies} pharmacies',
      missingGroups:
        'For this day it has not been announced which pharmacies are on duty in: {groups}. One there may be on duty without our knowing. Call before you go.',
      pageTitle: 'On-duty pharmacies in Thessaloniki — {date}',
      pageDescription:
        'On-duty and overnight pharmacies in Thessaloniki for {date}, by area, with hours and phone numbers. Source: Pharmaceutical Association of Thessaloniki.',
      prev: 'Previous day',
      next: 'Next day',
      pagerLabel: 'Other days',
      sourceLine: 'Source: Pharmaceutical Association of Thessaloniki',
      sourcePdf: 'List as PDF',
      uploadedAt: 'Uploaded:',
      hoursLabel: 'Hours:',
      hoursNotStated: 'not stated, call before you go',
      nextDay: 'until the next day',
      extraHoursLabel: 'Extra hours:',
      exceptHolidays: 'except public holidays',
      noPharmacyPage: 'There is no page for this pharmacy.',
      kinds: {
        day: 'Day duty',
        'saturday-extra': 'Saturday extra',
        'on-duty': 'On duty',
        overnight: 'Overnight',
        'after-midnight': 'After midnight',
      },
      onlyPublished: 'Only officially published duty dates are shown. Call before you go.',
    },

    area: {
      indexTitle: 'Pharmacies in Thessaloniki by area',
      indexDescription:
        'The pharmacies of the Thessaloniki regional unit by area, with their opening hours and official duty days.',
      indexIntro:
        'Choose an area to see its pharmacies, which ones are open today and when they are on duty. Areas are grouped as in the duty lists.',
      otherGroup: 'Other areas',
      countOne: '1 pharmacy',
      countMany: '{count} pharmacies',
      pageTitle: 'Pharmacies in {area} — hours and duty dates',
      pageDescription:
        'The {count} pharmacies in {area}: address, phone, which ones are open today and the official duty dates.',
      h1: 'Pharmacies in {area}',
      groupLabel: 'Duty group:',
      openNowHeading: 'Open now',
      openNowLoading: 'Checking…',
      openNowSummary: 'Open now: {open} of {total}.',
      openNowError: 'The information did not load. See the home page or call before you go.',
      openNowNoScript: 'To see which ones are open now, JavaScript is needed.',
      closedNow: 'Closed now',
      listHeading: 'All pharmacies in the area',
      dutyHeading: 'Official duty dates in the area',
      dutyNone: 'No published duty dates for this area from today onward.',
      allAreas: 'All areas',
    },

    status: {
      openUntil: '{label} until {when}',
      untilToday: '{time}',
      closingSoon: 'closing soon',
      closed: 'Closed now.',
      opensAt: 'Opens {when}.',
      noNextOpen: 'We do not know when it opens in the next 7 days.',
      unpublished:
        'It has not been announced yet which pharmacies are on duty here that day, so this may change.',
      unpublishedShort: 'not known yet if it is on duty',
      loadFailed: 'Not all duty days loaded, so this may change.',
      whenToday: 'today at {time}',
      whenTomorrow: 'tomorrow at {time}',
      whenWeekday: '{weekday} at {time}',
      whenDate: '{date} at {time}',
      callFirst: 'Call before you go.',
      computedAt: 'Checked at {time}.',
    },
  },
};
