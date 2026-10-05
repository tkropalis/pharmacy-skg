import { appEn } from './app.en.ts';
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
    lastUpdatedLabel: 'Last updated:',
    navLabel: 'Information',
    disclaimer: 'Call before you go. Not medical advice.',
    about: 'About and disclaimer',
    aboutShort: 'About',
    privacy: 'Privacy',
    report: 'Report a mistake',
    creditsLine:
      'Duty pharmacies come from the Pharmaceutical Association of Thessaloniki and opening hours from the Region of Central Macedonia. Map: OpenStreetMap and OpenFreeMap.',
    creditsMore: 'All sources',
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
    title: 'About and disclaimer',
    description:
      'What the app is, where the opening hours come from, what “On duty” and “Open” mean and which sources it uses.',
    disclaimerTitle: 'Call before you go',
    disclaimerBody:
      'Opening hours come from official lists and can change or contain mistakes. An individual pharmacy may be closed without us knowing. Call before you go. This app does not give medical advice.',
    sections: [
      {
        heading: 'What this app is',
        paragraphs: [
          'It shows which pharmacies in the Thessaloniki regional unit are open now or later: those on duty, those open overnight and those open on their own hours.',
          'It is free and ad-free, and it never ranks or promotes pharmacies. It is independent and has no official connection with the Pharmaceutical Association of Thessaloniki or the Region of Central Macedonia.',
        ],
      },
      {
        heading: 'Where the opening hours come from',
        paragraphs: [
          'Only from official lists: the duty lists of the Pharmaceutical Association of Thessaloniki, as re-published by thess.guide, and the Region of Central Macedonia’s list of pharmacies that stay open longer (extended hours). Every other pharmacy follows the usual hours: Monday and Wednesday 08:00–14:30, Tuesday, Thursday and Friday 08:00–14:00 and 17:00–21:00, closed on weekends and holidays.',
          'We show only duty dates that have been officially published. We make no forecasts of future duties. No summer schedule is applied until one has been verified for the year.',
        ],
      },
      {
        heading: 'What the words mean',
        paragraphs: [
          'Every pharmacy has a word next to it, not just a colour. On the map, each case also has its own shape.',
        ],
      },
    ],
    statusList: {
      onDutyMeaning:
        'The pharmacy is in the official duty list of the Pharmaceutical Association of Thessaloniki for the time you are looking at, with the hours that the list gives.',
      openRegularMeaning:
        'The pharmacy is open on its own hours: the usual pharmacy hours or, for those that stay open longer, the hours announced by the Region of Central Macedonia. On the map, the first have a dot and the second a diamond.',
      openExtendedMeaning:
        'A pharmacy may close on some day without our knowing, so call before you go.',
    },
    creditsHeading: 'Sources and licences',
    creditsIntro: 'This app builds on the work of others. Thank you:',
    credits: {
      fsth: 'Duty lists: Pharmaceutical Association of Thessaloniki, via thess.guide, with the content unchanged.',
      pkm: 'Pharmacies open longer and the usual hours: Region of Central Macedonia.',
      overture: 'Pharmacy locations: Overture Maps Foundation, licensed CDLA-Permissive-2.0.',
      osm: 'Address geocoding with Nominatim and the map: © OpenStreetMap contributors, licensed ODbL.',
      openFreeMap: 'Map tiles: OpenFreeMap, with OpenMapTiles and OpenStreetMap data.',
      fontAwesome: 'Icons: Font Awesome Free, under CC BY 4.0.',
      commissioner: 'Typeface: Commissioner by Kostas Bartsokas, under SIL OFL 1.1.',
    },
    sourceHeading: 'Open source',
    sourceBody: 'The code and the data are open (MIT licence) on GitHub.',
    reportCta: 'Found a mistake? Tell us.',
    emergencyHeading: 'Emergency',
    emergencyBody:
      'In an emergency call 166 (ambulance, EKAB) or 112 straight away. For poisoning call the Poison Centre, 210 7793777.',
  },

  privacy: {
    title: 'Privacy',
    description:
      'Your location and searches stay on your device. No cookies, no accounts, only anonymous aggregate statistics.',
    summary:
      'Your location and searches never leave your device. There are no accounts and no cookies.',
    sections: [
      {
        heading: 'Location',
        paragraphs: [
          'When you open the app it asks for your location to show the nearest pharmacies; your browser asks you first. If you allow it, it is used only on your device to work out distances, and it is refreshed while the page is open and visible. It is not sent to any server and it is not stored. If you refuse, you can pick an area by hand.',
        ],
      },
      {
        heading: 'Searches',
        paragraphs: [
          'Whatever you search for, such as a medicine or a pharmacy, is handled on your device.',
        ],
      },
      {
        heading: 'Favourites and settings',
        paragraphs: [
          'Favourite pharmacies are saved in your browser’s local storage (localStorage), and only there. They are deleted when you clear the site data. Your choices live there too: the area you picked, whether you turned off the location request, and the list filter. Coordinates are never stored.',
        ],
      },
      {
        heading: 'Offline use',
        paragraphs: [
          'To work without a connection, your device keeps temporary copies of the app, of the next few days’ duty lists and of the map tiles you have viewed.',
        ],
      },
      {
        heading: 'Usage statistics',
        paragraphs: [
          'When enabled, we count page views with anonymous, aggregate statistics that use no cookies and do not follow you across other sites. There are no user profiles and we do not sell data.',
        ],
      },
      {
        heading: 'Map',
        paragraphs: [
          'The map loads tiles from the OpenFreeMap service. Like any website, it sees your IP address and the area of the map being shown, but not your exact location.',
        ],
      },
      {
        heading: 'Problem reports',
        paragraphs: [
          'Reports sent from the form become public issues on GitHub, which anyone can read. Do not include personal information. If you do by mistake, write to us and we will remove it.',
        ],
      },
      {
        heading: 'Hosting',
        paragraphs: [
          'The site is hosted on Vercel, which, like any hosting provider, keeps standard request logs for security and operation.',
        ],
      },
    ],
    contact: 'Questions? Open an issue on GitHub.',
  },

  report: {
    title: 'Report a mistake',
    description:
      'Wrong hours, a pharmacy you found closed, a wrong location or phone? Tell us so we can fix it.',
    intro:
      'Did you find a mistake in the hours, location or phone number of a pharmacy? Tell us so we can fix it.',
    warningTitle: 'Do not include personal information',
    warningBody:
      'Your report becomes a public issue on GitHub that anyone can read. Do not include names, phone numbers, home addresses, health details or any other personal data.',
    form: {
      pharmacyLabel: 'Pharmacy (name or ID, optional)',
      pharmacyHint: 'For example the name or the ID shown for the pharmacy.',
      typeLabel: 'What is wrong?',
      typeOptions: {
        'wrong-hours': 'Wrong opening hours',
        'closed-but-listed-open': 'It was closed but listed as open',
        'wrong-location': 'Wrong location on the map',
        'wrong-phone': 'Wrong phone number',
        other: 'Something else',
      },
      messageLabel: 'Description',
      messageHint: 'Up to 1000 characters. No personal information.',
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
    sourcePkm: 'Source: Region of Central Macedonia',
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
      regularLabel: 'Usual hours:',
      regularClosed: 'Closed: {days} and public holidays.',
      regularNote:
        'They apply when the pharmacy is not on duty and has no longer hours. A pharmacy may close on some day without our knowing, so call before you go.',
      extendedHeading: 'Longer hours',
      extendedPeriod: 'In force from {from} to {to}',
      extendedAnnouncement: 'Announcement by the Region of Central Macedonia',
      extendedNote: 'On the days it lists, it replaces the usual hours.',
      dutyHeading: 'Official duty dates',
      dutyIntro:
        'Only duty days announced by the Pharmaceutical Association of Thessaloniki. We make no forecasts.',
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
      indexCounts: '{groups} area groups, {pharmacies} pharmacies',
      missingGroups:
        'For this day it has not been announced which pharmacies are on duty in: {groups}. One there may be on duty without our knowing. Call before you go.',
      pageTitle: 'On-duty pharmacies in Thessaloniki — {date}',
      pageDescription:
        'On-duty and overnight pharmacies in Thessaloniki for {date}, by area, with hours and phone numbers. Source: Pharmaceutical Association of Thessaloniki.',
      prev: 'Previous day',
      next: 'Next day',
      allDates: 'All dates',
      pagerLabel: 'Other days',
      sourceLine: 'Source: Pharmaceutical Association of Thessaloniki',
      sourcePdf: 'List as PDF',
      uploadedAt: 'Uploaded:',
      hoursLabel: 'Hours:',
      hoursNotStated: 'the list gives no hours, call first',
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
