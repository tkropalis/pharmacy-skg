# Product

Who the app is for and what every screen must do. The visual system is in [DESIGN.md](DESIGN.md); the reasons behind each choice, with dates, are in [decisions.md](decisions.md). Design tools that read `PRODUCT.md` and `DESIGN.md` (such as the Impeccable plugin) find these files here; without such tools, read them yourself before any UI or copy change.

## Register

product

## Platform

web

## Users

Everyone in the areas the app covers (Thessaloniki, Attica and 31 other areas so far, from Evros to Crete; all of Greece in time) who needs a pharmacy now: a parent at 2 a.m. with a sick child, an older person who has never heard of the pharmacists' association, a visitor who does not read Greek. They are usually on a phone, often in a hurry, sometimes in a dark room, often with large text turned on. The job is to find the nearest pharmacy that is open (or on duty) at this moment, then call it or get directions. A smaller group plans ahead: which pharmacy is on duty on Saturday, which favourite is open tomorrow.

## Product Purpose

A free, ad-free web app (a PWA) that answers "which pharmacy is open now, near me?" from official sources: the duty lists of each area's pharmaceutical association and, where a Region publishes them, the regular and extended hours, plus a medicine price and shortage search. Where an area's regular hours are not known, it shows only the pharmacies on duty and says so. Success is the answer on screen within seconds, with a working Call button, and data that is never shown as fresher or more certain than it is.

## Positioning

The calm, plain answer to an urgent question: the nearest open pharmacy, how long it stays open, and one tap to call.

## Brand Personality

Calm, plain, trustworthy. A public service, not a product that wants attention: no persuasion, no exclamation marks, no clever wording. It speaks everyday Greek (Greek is the default; English is complete) and says what it does not know ("Καλέστε πριν πάτε").

## Anti-references

- Delivery and booking apps: promotions, ratings, badges, banners, anything that ranks or sells.
- Government portals: administrative names, abbreviations (ΦΣΘ, ΠΚΜ), parentheses, long notes about sources and procedures.
- Generic "AI-made" interfaces: tinted icon tiles everywhere, identical card grids, small uppercase eyebrows over every heading, gradient text, glass effects, em dashes and tricolons in the copy.
- Alarming emergency styling: red strips and warnings on every screen.

## Design Principles

1. **The answer first.** The nearest open pharmacy, with Call and Directions, is the first thing on the screen. Everything else is one tap away or on another page.
2. **As few words as possible.** One sentence per warning. No explanations of sources, privacy or how the app works outside the about and privacy pages.
3. **Never colour alone, never certainty it does not have.** Every status has words and its own marker; freshness is always visible; missing duty lists are said plainly.
4. **Built for a phone in one hand, at night.** Large targets, the list first, a calm dark look on request, text that grows with the system setting.
5. **Neutral.** No ads, rankings, promotions or medical claims; every source credited on the about page.

## Accessibility & Inclusion

WCAG 2.2 AA everywhere (axe runs in the browser tests on every page type, in both languages and both looks). Every tap target is at least 44px. Text sizes are in rem and follow the iPhone's text size. Motion stops with "reduce motion". Status is never shown by colour alone. Screen readers hear every change that matters through one polite live region (the list's count, a chosen pharmacy, "link copied"). Older people and first-time visitors are the reference users for every word on screen.
