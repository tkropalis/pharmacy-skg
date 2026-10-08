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
    available: 'A new version is ready.',
    reload: 'Reload',
    dismiss: 'Close',
  },

  stale: {
    title: 'This information may be out of date.',
    body: 'Call before you go.',
  },

  status: { ...STATUS_LABELS.en },

  footer: {
    lastUpdatedLabel: 'Updated',
    offline: 'Offline',
    navLabel: 'Information',
    disclaimer: 'Call before you go.',
    aboutShort: 'About',
    privacy: 'Privacy',
    report: 'Report a mistake',
  },

  home: {
    title: 'Open pharmacies near you',
    documentTitle: 'On-duty and overnight pharmacies now',
    description: 'Open, on-duty and overnight pharmacies right now, on a map. Free, no ads.',
    noScript: 'The map needs JavaScript.',
    dutyLink: 'Duty lists by day',
  },

  about: {
    title: 'About',
    description: 'What the app is and where its data comes from.',
    disclaimer:
      'Call before you go. Opening hours can be wrong. This app does not give medical advice.',
    sections: [
      {
        heading: 'What it is',
        paragraphs: [
          'It shows which pharmacies are open. Areas: {cities}. It is free, with no ads. It is not connected to any pharmaceutical association or Region.',
        ],
      },
      {
        heading: 'Opening hours',
        paragraphs: [
          'We show only officially announced duty days. In Thessaloniki other pharmacies have the usual hours: Monday and Wednesday 08:00–14:30, Tuesday, Thursday and Friday 08:00–14:00 and 17:00–21:00. Some have longer hours, announced by the Region.',
          'In Attica the usual hours are Monday and Wednesday 08:00–14:30, Tuesday, Thursday and Friday 08:00–14:00 and 17:00–20:00 in winter, 17:30–20:30 in summer. Some have longer hours, announced by the Pharmaceutical Association of Attica.',
          'In the other areas we do not know the usual hours yet, so we show only the pharmacies on duty.',
          'Some duties are on call: the pharmacist serves whoever phones. So call before you go.',
        ],
      },
    ],
    install: {
      heading: 'Install',
      body: 'Add the app to your Home Screen. It also opens offline, with the data from the last update.',
      ios: 'On iPhone and iPad: in Safari, tap Share, then “Add to Home Screen”.',
      button: 'Install',
    },
    /** One per area whose lists come straight from its own site, followed by the site's link. */
    dutyCredit: '{area}: {source},',
    creditsHeading: 'Sources',
    credits: {
      fsth: 'Duty lists in Thessaloniki: Pharmaceutical Association of Thessaloniki, via',
      pkm: 'Opening hours in Thessaloniki: Region of Central Macedonia.',
      patt: 'Opening hours in Attica: Region of Attica.',
      fsaHours: 'Longer hours in Attica: Pharmaceutical Association of Attica.',
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
    emergencyAmbulance: 'Ambulance',
    emergencyOr: 'or',
    emergencyPoison: 'Poison Centre',
  },

  privacy: {
    title: 'Privacy',
    description:
      'Your location and searches never leave your device. There are no accounts or cookies.',
    summary:
      'Your location and searches never leave your device. There are no accounts or cookies.',
    sections: [
      {
        heading: 'Location',
        paragraphs: [
          'It is used only on your device, to work out distances, and is not sent anywhere. The last one is kept on your device, approximately, so we do not ask every time. “Remove” deletes it.',
        ],
      },
      {
        heading: 'Favourites and settings',
        paragraphs: [
          'Favourites, recent areas, the pharmacies you open often and your settings stay only in your browser and are deleted when you clear the site’s data.',
        ],
      },
      {
        heading: 'Offline',
        paragraphs: [
          'The app keeps the pages, data and map pieces it needs to open offline on your device. Once it is installed, your browser may refresh the data in the background.',
        ],
      },
      {
        heading: 'Statistics',
        paragraphs: ['We count visits anonymously and without cookies, with Vercel Web Analytics.'],
      },
      {
        heading: 'Map and hosting',
        paragraphs: [
          'The map loads from OpenFreeMap and the site is hosted on Vercel. As with any website, they see your IP address.',
        ],
      },
      {
        heading: 'Mistake reports',
        paragraphs: ['They are published on GitHub. Do not include personal information.'],
      },
    ],
    contact: 'Questions?',
  },

  report: {
    title: 'Report a mistake',
    description: 'Wrong hours, location or phone number? Tell us so we can fix it.',
    warningTitle: 'Do not include personal information',
    warningBody: 'Reports are published on GitHub for anyone to read.',
    form: {
      pharmacyLabel: 'Which pharmacy?',
      pharmacyHint: 'Optional.',
      typeLabel: 'What is wrong?',
      typeOptions: {
        'wrong-hours': 'Wrong hours',
        'closed-but-listed-open': 'Closed, but shown as open',
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
      successTitle: 'Thank you.',
      successBody: 'Your report was sent.',
      viewIssue: 'View the report on GitHub',
      sendAnother: 'New report',
      errorTitle: 'The report was not sent.',
      errorValidation: 'Check the fields and try again.',
      errorUnavailable: 'Try again later.',
      errorNetwork: 'Check your connection.',
      fallbackBody: 'Or send it on GitHub, if you have an account:',
      fallbackLink: 'Open on GitHub',
      issueTitlePrefix: 'Report',
      issueNoPharmacy: 'no pharmacy',
      noScript: 'The form needs JavaScript. Send your report on',
    },
  },

  app: appEn,
  search: searchEn,

  notFound: {
    title: 'Page not found',
    body: 'The address you asked for does not exist.',
    homeLink: 'Home page',
  },

  // Search-engine pages (milestone M3): pharmacy, duty-date and area pages. {name} style
  // placeholders are filled in by lib/seo/format.ts `fill`.
  seo: {
    weekdaysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    footerDuty: 'Duty lists by day',
    footerArea: 'Pharmacies by area',
    todayBadge: 'Today',
    breadcrumbLabel: 'Breadcrumb',

    pharmacy: {
      title: 'Pharmacy {name}, {locality}',
      description:
        'Pharmacy {name}, {address}, {locality}. Phone, opening hours and official duty days.',
      statusHeading: 'Right now',
      statusLoading: 'Checking if it is open…',
      statusError: 'Did not load. Call the pharmacy.',
      contactHeading: 'Details',
      addressLabel: 'Address',
      call: 'Call {phone}',
      noPhone: 'No phone number.',
      areaLabel: 'Area',
      directions: 'Directions in Google Maps',
      hoursHeading: 'Opening hours',
      regularLabel: 'Usual hours',
      regularClosed: 'Closed: {days} and public holidays.',
      regularUnknown: 'Call for the hours.',
      extendedHeading: 'Longer hours',
      extendedPeriod: 'From {from} to {to}',
      extendedAnnouncement: 'Announcement',
      dutyHeading: 'Duty days',
      dutyUpcoming: 'Upcoming',
      dutyRecent: 'Last 14 days',
      dutyNone: 'No duty announced.',
      reportLink: 'Report a mistake',
    },

    duty: {
      indexTitle: 'Pharmacies on duty by day',
      indexDescription:
        'The official lists of on-duty and overnight pharmacies, day by day, as announced by the pharmaceutical associations.',
      indexIntro: 'Choose a day.',
      indexNone: 'No lists yet.',
      indexCounts: '{pharmacies} pharmacies',
      missingGroups: 'Duty lists not announced yet for: {groups}. Call before you go.',
      pageTitle: 'Pharmacies on duty, {city}, {date}',
      todayTitle: 'Pharmacies on duty today, {city}',
      todayDescription:
        'On-duty and overnight pharmacies today, {city}, by area, with hours and phone numbers. Source: {source}.',
      pageDescription:
        'On-duty and overnight pharmacies, {city}, {date}, by area, with hours and phone numbers. Source: {source}.',
      prev: 'Previous day',
      next: 'Next day',
      pagerLabel: 'Other days',
      sourceLink: 'Official list',
      hoursLabel: 'Hours:',
      hoursNotStated: 'call for the hours',
      nextDay: 'next day',
      extraHoursLabel: 'Also:',
      exceptHolidays: 'not on public holidays',
    },

    area: {
      indexTitle: 'Pharmacies by area',
      indexDescription: 'Pharmacies by area, with their opening hours and official duty days.',
      indexIntro: 'Choose an area.',
      otherGroup: 'Other areas',
      countOne: '1 pharmacy',
      countMany: '{count} pharmacies',
      pageTitle: 'Pharmacies in {area}: hours and duty days',
      pageDescription:
        'The {count} pharmacies in {area}: address, phone, which ones are open today and the official duty days.',
      pageDescriptionOne:
        'The pharmacy in {area}: address, phone, whether it is open today and the official duty days.',
      h1: 'Pharmacies in {area}',
      openNowHeading: 'Open now',
      openNowSummary: '{open} of {total}.',
      openNowNone: 'None open.',
      openNowError: 'Did not load. Call before you go.',
      openNowNoScript: 'Needs JavaScript.',
      closedNow: 'Closed now',
      notOnDutyNow: 'Not on duty now',
      dutyNowSummary: '{open} of {total} on duty.',
      dutyNowNone: 'None on duty now.',
      listHeading: 'All pharmacies',
      dutyHeading: 'Duty days',
      dutyNone: 'No duty days announced.',
      allAreas: 'All areas',
    },

    status: {
      openUntil: '{label} until {when}',
      untilToday: '{time}',
      closingSoon: 'closing soon',
      closed: 'Closed now.',
      opensAt: 'Opens {when}.',
      notOnDuty: 'Not on duty now.',
      dutyAt: 'On duty {when}.',
      noNextOpen: 'Opening time unknown for the next 7 days.',
      unpublished: 'The day’s duty lists are not announced yet.',
      unpublishedShort: 'duty not announced yet',
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
