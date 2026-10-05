import type { Dictionary } from './index.ts';

export const en: Dictionary = {
  localeName: 'English',
  languageSwitcherLabel: 'Language',
  skipToContent: 'Skip to content',
  tagline: 'Free and ad-free',
  homeLinkLabel: 'Home',

  emergency: {
    label: 'Emergency',
    ambulance: 'Ambulance (EKAB)',
    europe: 'European emergency number',
    poison: 'Poison Centre',
  },

  stale: {
    title: 'This data may be out of date.',
    body: 'It has not been updated for more than 36 hours. Call the pharmacy before you go.',
  },

  status: {
    onDuty: 'On duty (ΦΣΘ list)',
    openRegular: 'Open (regular hours)',
  },

  footer: {
    lastUpdatedLabel: 'Last updated:',
    sourcesHeading: 'Data sources',
    mapHeading: 'Map',
    navLabel: 'Information',
    disclaimer: 'Call before you go. Not medical advice.',
    about: 'About and disclaimer',
    privacy: 'Privacy',
    report: 'Report a problem',
    sourceCode: 'Source code on GitHub',
    sourceNotes: {
      fsth: 'Duty lists (ΦΣΘ, via thess.guide)',
      pkm: 'Extended opening hours',
      overture: 'Pharmacy locations (CDLA-Permissive-2.0)',
      osm: 'Geocoding via Nominatim (ODbL)',
    },
    thessGuideNote: 'copies of the ΦΣΘ lists',
    openFreeMapNote: 'map tiles',
    openMapTilesNote: 'map data schema',
    openStreetMapNote: 'map data, © OpenStreetMap contributors (ODbL)',
  },

  home: {
    title: 'Open pharmacies in Thessaloniki',
    description:
      'Which pharmacies are open right now in Thessaloniki: on duty, overnight and regular hours, on a map. Free and ad-free.',
    intro:
      'A map of the pharmacies that are open right now near you: on duty, overnight and regular hours.',
    comingSoon: 'Coming soon.',
    untilThen: 'Until then, see the on-duty list from the',
    fsthName: 'Pharmaceutical Association of Thessaloniki',
    appRegionLabel: 'Pharmacy map',
    noScript: 'The map needs JavaScript.',
  },

  about: {
    title: 'About and disclaimer',
    description:
      'What the app is, where the opening hours come from, how the status labels work and which sources it uses.',
    disclaimerTitle: 'Call before you go',
    disclaimerBody:
      'Opening hours come from official lists and can change or contain mistakes. An individual pharmacy may be closed without us knowing. Call before you go. This app does not give medical advice.',
    sections: [
      {
        heading: 'What this app is',
        paragraphs: [
          'It shows which pharmacies in the Thessaloniki regional unit are open now or later: on duty, overnight, and on regular or extended hours.',
          'It is free and ad-free, and it never ranks or promotes pharmacies. It is independent and has no official connection with the Pharmaceutical Association of Thessaloniki (ΦΣΘ) or the Region of Central Macedonia (ΠΚΜ).',
        ],
      },
      {
        heading: 'Where the opening hours come from',
        paragraphs: [
          'Only from official lists: the daily ΦΣΘ duty lists, as re-published by thess.guide, and the ΠΚΜ extended-hours list. Every other pharmacy follows the regular hours: Monday and Wednesday 08:00–14:30, Tuesday, Thursday and Friday 08:00–14:00 and 17:00–21:00, closed on weekends and holidays.',
          'We show only duty dates that have been officially published. We make no forecasts of future duties. No summer schedule is applied until one has been verified for the year.',
        ],
      },
      {
        heading: 'How the status labels work',
        paragraphs: ['Status is never shown by colour alone: every label also has text.'],
      },
    ],
    statusList: {
      onDutyMeaning:
        'The pharmacy is in the official ΦΣΘ duty list for the time you are looking at, with the hours that the list prints.',
      openRegularMeaning:
        'The pharmacy is open only according to its regular or extended hours. We cannot know about individual closures, so check by phone.',
    },
    creditsHeading: 'Sources and licences',
    creditsIntro: 'This app builds on the work of others. Thank you:',
    credits: {
      fsth: 'Duty lists: Pharmaceutical Association of Thessaloniki (ΦΣΘ), via thess.guide, with the content unchanged.',
      pkm: 'Extended hours: Region of Central Macedonia (ΠΚΜ).',
      overture: 'Pharmacy locations: Overture Maps Foundation, licensed CDLA-Permissive-2.0.',
      osm: 'Address geocoding with Nominatim and the map: © OpenStreetMap contributors, licensed ODbL.',
      openFreeMap: 'Map tiles: OpenFreeMap, with OpenMapTiles and OpenStreetMap data.',
    },
    sourceHeading: 'Open source',
    sourceBody: 'The code and the data are open (MIT licence) on GitHub.',
    reportCta: 'Found a mistake? Send us a report.',
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
          'If you allow access to your location, it is used only on your device to work out distances. It is not sent to any server and it is not stored. You can pick an area by hand instead.',
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
          'Favourite pharmacies are saved in your browser’s local storage (localStorage), and only there. They are deleted when you clear the site data.',
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
    title: 'Report a problem',
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

  notFound: {
    title: 'Page not found',
    body: 'The address you asked for does not exist.',
    homeLink: 'Back to the home page',
  },
};
