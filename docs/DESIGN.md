# Design

The visual system of the app, as built, and how to change it without breaking it. Who it is for and the principles are in [PRODUCT.md](PRODUCT.md); the reasons and dates are in [decisions.md](decisions.md) (Look, Motion, Home layout, The chosen pharmacy, Plain words). This file is the source of truth for every UI change, with or without design plugins: if a plugin or a habit suggests something that contradicts it, this file wins. Change this file in the same pull request when the system changes.

## Overview

A light, calm, map-and-list app in pharmacy green on tinted near-white, with an optional dark look (deep green-black). Restrained colour: tinted neutrals, one green accent, and status tints that always come with words and a marker. One typeface (Manrope). Plain lists divided by hairlines, not cards; the only cards are the answer (the nearest open pharmacy) and the chosen pharmacy's card. Motion is short and slows into place.

## Colour

Every colour is a token. Components never use hex values; a new colour is a new token, defined for both looks, with its contrast checked.

| Token             | Light     | Dark      | Use                                            |
| ----------------- | --------- | --------- | ---------------------------------------------- |
| `--bg`            | `#f4f7f5` | `#0e1512` | Page background                                |
| `--surface`       | `#ffffff` | `#151d19` | Sheet, header, cards, dialogs                  |
| `--soft`          | `#eef3f0` | `#1f2a25` | Segmented track, hovers, fields                |
| `--fg`            | `#1c2622` | `#e4ece7` | Text                                           |
| `--muted`         | `#5d6b64` | `#a0b2a9` | Secondary text (never for anything essential)  |
| `--accent`        | `#0a7d45` | `#43c584` | Primary buttons, links, Call                   |
| `--accent-ink`    | `#0b6b3a` | `#8ddfb3` | Text and icons on `--accent-soft`              |
| `--accent-soft`   | `#e3f3ea` | `#183628` | Selection, origin chip, round Directions       |
| `--on-accent`     | `#ffffff` | `#04140c` | Text on `--accent`                             |
| `--border`        | `#e3e9e5` | `#26322c` | Hairlines (decoration only)                    |
| `--border-strong` | `#7b8e85` | `#64786e` | Edges a control needs to be seen (3:1)         |
| `--focus`         | `#1d5fd6` | `#86adff` | Focus outlines                                 |
| `--warn-*`        | amber     | amber     | Notices and callouts that need attention       |
| `--danger-*`      | red       | red       | Only real problems (load errors, missing list) |

Status colours (`apps/web/src/components/app/app.css`, `.hs`): on duty (with or without printed hours) is the pharmacy green on its green tint, open the same green on a neutral tint, closed grey, each as ink on its tint (`--kind-*` and `--kind-*-bg`, set per `[data-kind]`). The map's markers use the same hues (`PIN_COLORS`, `apps/web/src/lib/pins.ts`); no status is orange, purple or blue, so the blue position dot stays the only blue on the map.

Contrast, measured: body text at least 4.5:1 in both looks (the lowest pair is `--muted` on `--soft`, 4.99 light and 6.66 dark); the status labels are 5.7 to 9.5 (the duty and open inks on their tints); edges of controls 3:1 or more. Check any new pair before using it (a contrast function is in `lib/map-layers.test.ts`).

## Markers

Every pharmacy is a rounded square with a cross (Font Awesome's plus, thickened), like the green cross outside every Greek pharmacy (`lib/pins.ts`). Size, body and glyph tell the statuses apart, never colour alone:

| Status                            | Marker                                     |
| --------------------------------- | ------------------------------------------ |
| Εφημερεύει                        | Large, solid green, white cross            |
| Εφημερεύει, καλέστε για το ωράριο | Large, solid green, white "?"              |
| Ανοιχτό (regular or extended)     | Smaller, white, green edge and green cross |
| Κλειστό (on request)              | Small, white, grey edge and cross, faded   |
| Approximate location              | The same with a dashed edge, white body    |

The chosen pharmacy is a drop with the same body and glyph. The list's status label is led by the same marker. Never draw a pharmacy as a dot: dots belong to the position.

## Typography

Manrope (variable, 200 to 800), self-hosted with Greek, Latin and Latin Extended subsets (`styles/fonts.css`). No second family. Sizes are in rem, so on iPhones and iPads they follow the system text size (`font: -apple-system-body` on touch screens, `global.css`); nothing is smaller than 0.75rem (12px).

| Role                        | Size                       | Weight  |
| --------------------------- | -------------------------- | ------- |
| Page title (h1)             | 1.5rem, 1.75rem from 40rem | 700     |
| Section (h2)                | 1.25rem                    | 700     |
| Body (pages)                | 1rem, line-height 1.55     | 450     |
| Home base                   | 0.9375rem, 1.4             | 450     |
| Pharmacy name (row)         | 0.9375rem (1.0625rem lead) | 700     |
| Status line, address        | 0.875rem                   | 450–650 |
| Status label, small notes   | 0.8125rem                  | 700     |
| Smallest (counts, captions) | 0.75rem                    | 600     |

Headings use `text-wrap: balance` and letter-spacing no tighter than -0.01em. Times and distances use tabular figures. Pharmacy names come from the registry in capitals without accents; show them as they are, without their legal form (`displayName`, `lib/names.ts`), on up to two lines; the pharmacy's own page keeps the registered name.

## Layout

- **Home screen** (`components/app/`): an app viewport (`100dvh`, safe areas respected). A one-row header (44px) above the map; a bottom sheet over the map on a phone, a 26rem side panel from 900px. The page never scrolls; the sheet's list does.
- **Sheet sizes** (`Sheet.tsx`, `sheetHeights`): collapsed (exactly the handle and the header, measured), default (70% of the screen: the list first), large (94%). A flick goes on to the next size; pulling the list down from its top lowers the sheet; moving the map lowers it too.
- **Other pages:** one column, max 44rem (`.container`), 1rem gutters (more with safe areas).
- **More than one city** (decision D26): the home screen shows one city at a time. The area picker lists the other covered cities among the areas (no count, since their data is not loaded); choosing one, or a position inside one, switches to it and the map moves there. Favourites of another city are one `.action` button each in the Favourites tab ("Λάρισα: 2 αγαπημένα"). In a city whose regular hours are not known, one `.callout` line ("Εδώ φαίνονται μόνο τα φαρμακεία που εφημερεύουν.") heads the list, the count says "εφημερεύουν", there is no "show closed" option, and the pages say "Δεν εφημερεύει" where they would say "Κλειστό".
- **Breakpoints:** 40rem (larger h1), 48rem (dialogs become centred panels), 900px (side panel).
- **Radii:** `--radius` 0.75rem (fields, notices), `--radius-lg` 1.25rem (dialogs), 1rem (lead row, selected row), 999px only for things you can tap (buttons, segmented controls, chips). Status labels are 0.375rem so they never look tappable.
- **Elevation:** `--shadow` and `--shadow-lg`; the sheet and the chosen marker have their own shadows. No glass, no blur except the marker's ground shadow.
- **Stacking (z-index):** map 1, map note 2, sheet 5, toast 6, header 10, update notice 60, skip link 100; dialogs use the native top layer (`<dialog>.showModal()`). Never add an arbitrary value.

## Components

| Component            | Where                                                  | Use it for                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Segmented control    | `Segmented.tsx`, `.seg` in app.css                     | Every either/or choice: the tabs, the list filter (its options are the counts), "now / another time", the appearance. Its thumb slides. Never in a row that scrolls sideways. |
| Row                  | `PharmacyRow.tsx`, `.row`                              | A pharmacy in a list: name, status label led by its marker, time, distance and address, 46px Call and Directions.                                                             |
| Lead row             | `.row.lead`                                            | Only the nearest pharmacy open now (with a position): on its status tint, with labelled 48px Call and Directions.                                                             |
| Chosen pharmacy card | `SelectionCard.tsx`, `.peek`                           | A pharmacy chosen on the map, in the lowered sheet (phone only).                                                                                                              |
| Chosen marker        | `map-controller.ts` (`.sel`), `selectedPinSvg`         | The chosen pharmacy on the map: drop, flag (name, until when), ground shadow; the other pins dim.                                                                             |
| Buttons              | `.action`, `.action.primary`, `.big-action`, `.round`  | 44px pill (secondary, primary filled), 48px labelled pill, 46px icon circle.                                                                                                  |
| Notice / callout     | `.notice` (inline), `.callout` (block, `.danger`)      | One sentence that needs attention. Never for explanations.                                                                                                                    |
| Dialogs              | `AreaPicker.tsx` (`.ap`), `MedicineSearch.tsx` (`.ms`) | Full screen on a phone, field at the top, results under it, Close at the top end; Back and Escape close them.                                                                 |
| Toast                | `.toast` in HomeApp                                    | A short visible confirmation ("link copied"); the live region says it to screen readers.                                                                                      |
| Found it closed      | `ClosedReport.tsx`, `.closed-report`                   | In the row details of a pharmacy shown as open now: a quiet link, then a confirmation with Αποστολή and Άκυρο, then one sentence.                                             |
| Emergency numbers    | `.sos`                                                 | 44px call buttons in the sheet's footer only (no emergency strip anywhere).                                                                                                   |

Reuse these before making anything new. A new component needs a reason a person would notice.

## Motion

Tokens (`global.css`): `--ease-out` (ease-out-quart) for most things, `--ease-out-expo` for things settling into place (the sheet, the thumb, the marker's drop); durations `--dur-1` 120ms (press, hover), `--dur-2` 200ms (fades, small moves), `--dur-3` 280ms (the sheet, the thumb, row details).

What moves, and why: the segmented thumb slides; a tab's panel comes in from its side; rows that stay slide to new places when the filter, place or time changes (FLIP, first 12 rows, `HomeApp.tsx`); row details open and close (`grid-template-rows`); the chosen marker drops in, then its flag; the sheet settles and follows a flick; the favourite star and count pop; the medicine search slides between results and details and fades out; the update notice rises in; the map fades in once drawn.

Rules: animate `transform` and `opacity` (the sheet's height is the one deliberate exception: its scroll area must end at its visible edge). No bounce or elastic curves. Motion must enhance something already visible, never gate content on an animation finishing. Every animation stops under `prefers-reduced-motion` (a global rule in `global.css`; the map camera checks it too). Add a new animation only when it shows where something came from or that something changed.

## Light and dark

Light by default. The footer's "Εμφάνιση" control offers light, dark and auto (dark after sunset where the person was last located, otherwise in Thessaloniki, or when the device asks); `public/theme.js` applies it before the first paint and sets `<html data-theme>`. Dark tokens are in `global.css` (`:root[data-theme='dark']`) and `app.css` (`--kind-*`). Every new screen or component must be checked in both looks. The map has its own dark base style (`lib/map-style.ts`); the markers keep their colours with a white halo.

## Icons

Font Awesome Free only (credited on the about page), drawn as inline SVG from the icon's path: `components/app/icons.tsx` in React, `lib/fa.ts` (`faSvg`) in Astro and on the map. Icons are decorative: every button has visible text or an accessible name. Do not put icons in tinted tiles or circles as decoration.

## Copy

Greek first; every string exists in Greek and English (`apps/web/src/i18n/`, `el.ts` defines the shape). The rules are in [decisions.md](decisions.md), Defaults, "Plain words": as few words as possible, one sentence per warning, one word for one thing (with the list of canonical terms), "Label: {name}" accessible names, no abbreviations, parentheses, em dashes or exclamation marks. Status words and duty kinds are defined once (`i18n/status-labels.ts`). `i18n.test.ts` fails on ΦΣΘ, ΠΚΜ, ΕΟΦ, ΦΠΑ, ΜΗΣΥΦΑ, em dashes and exclamation marks in any UI string.

## Banned patterns

These read as generic or machine-made, or they hurt the people this app is for. Do not add them; remove them when you find them.

- Em dashes (—) anywhere in UI copy or page titles; spaced en dashes as punctuation. Time ranges use an unspaced en dash ("08:00–14:00").
- Side-stripe borders (a coloured `border-left`/`border-right` or inset stripe over 1px on cards, rows, callouts).
- Gradient text, glass effects (`backdrop-filter`), decorative blur.
- Small uppercase tracked "eyebrow" labels above headings; numbered section markers.
- Icons in tinted tiles or circles repeated as decoration; rows of identical icon-over-label buttons.
- Identical bordered cards for every item; cards inside cards. Lists are plain lists.
- Pills on things you cannot tap (status labels are rounded rectangles).
- Hero numbers, badges, ratings, promotions.
- Copy: exclamation marks, tricolons, "simply/just/easily", sentences that restate their heading, explanations of how the app works or where the data comes from outside the about and privacy pages, Title Case in English UI, administrative names and abbreviations.
- Hard-coded colours, arbitrary z-index values, `transition: all`, text under 12px, targets under 44px.

Quick checks from the repository root:

```sh
# Em dashes (fine in code comments, never in strings or markup):
grep -rn "—" apps/web/src --include=*.ts --include=*.tsx --include=*.astro
# Side stripes, gradient text, glass, eyebrows, transition: all:
grep -rnE "border-(left|right|inline-start|inline-end):\s*[2-9]" apps/web/src
grep -rnE "background-clip:\s*text|backdrop-filter|text-transform:\s*uppercase|transition:\s*all" apps/web/src
# Colours outside the token files:
grep -rnE "#[0-9a-fA-F]{6}" apps/web/src --include=*.css --include=*.astro | grep -v "styles/global.css\|app/app.css"
```

## Reviewing a change (without design plugins)

Do this for every UI or copy change, before the pull request.

1. **Look at it** (see "Verifying" below) at 393×852 (iPhone 15), 375×667 (iPhone SE) and 1280×800, in light and dark, in Greek and English.
2. **Three people, one task each.** Walk through the change as:
   - an older first-time visitor with large text, who must find the nearest open pharmacy and call it;
   - a parent at 2 a.m., one-handed, in the dark look, who needs the answer in seconds;
   - a screen-reader user, who must hear what changed (count, chosen pharmacy, errors) and reach every action.
     Anything they would stop at is a defect.
3. **Questions to answer yes to:** Is the answer (nearest open, Call) still first? Can anything on screen go without losing meaning? Is every state covered (loading, empty, error, offline, no position, no duty list, closed)? Does every status have words? Are there more than four choices at one point (group or hide the rest)? Is freshness still visible?
4. **Copy pass:** read every new string aloud in Greek. Apply the "Plain words" rules in decisions.md; check terms against the canonical list; count the words and cut. Both languages, same meaning, no extra words in either.
5. **Banned patterns:** run the quick checks above.
6. **Accessibility:** 44px targets, visible focus, names that start with the visible text, `aria-expanded`/`aria-pressed` where they apply, nothing conveyed by colour alone, reduced motion respected. The axe checks in `e2e/a11y.spec.ts` must pass.
7. **Docs:** update this file and decisions.md when the system or a behaviour changes.

## Verifying

- **Build and preview**, not the dev server: `pnpm --filter @pharmacy-skg/web build`, then `pnpm --filter @pharmacy-skg/web preview` (port 4321 by default; `astro dev` has failed to mount the React islands with a "preamble" error, and the service worker only runs in a build).
- **A stale page** is usually the service worker serving the previous build. In the browser console: `(await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister()); for (const k of await caches.keys()) await caches.delete(k);` then reload.
- **The look:** `window.pharmacyTheme.set('dark')` (or `'light'`, `'auto'`) in the console, or the footer control.
- **Time of day matters:** at night only duty pharmacies are open, by day over a thousand are. Check both; the browser tests fix the clock to Monday 22:30 (`e2e/constants.ts`).
- **The map** draws only while its tab is visible (a hidden tab pauses animation frames, so it stays on "Φόρτωση χάρτη…"), and it starts a second or so after the list. Some automated browsers send clicks the map does not see as taps; dispatch `mousedown`, `mouseup` and `click` on `.maplibregl-canvas`, or select from the list (which shows the same marker).
- **Tests:** `pnpm test` for the logic; `pnpm e2e` for the browser tests (see `apps/web/README.md`, Browser tests). Update the tests in the same change when you change a class, a label or a flow they rely on.
