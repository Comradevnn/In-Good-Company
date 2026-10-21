# Product

<!-- impeccable:product-schema 1 -->

> **Assumptions.** Inferred from the public code, README and
> specs/plotline.html, without an owner interview, and high level on
> purpose. The product's full
> design lives in a private specs repo; this file does not restate it.
> Confirm or correct with `/impeccable init`.

## Platform

adaptive

One Expo / React Native app for iOS and Android. The owner tests mainly on
an Android phone (Expo Go, edge-to-edge), so Android layout and keyboard
behavior matter as much as iOS.

## Users

- **Volunteers** (primary): adults who want to volunteer with someone
  rather than on their own. They use the app on their phone,
  in short sessions: signing up, setting when they are free, and checking
  whether a partner and a shift have been found.
- **Organizations** (secondary): charities that list shifts and check
  volunteers in. They have their own screens in the same app.

## Product Purpose

In Good Company matches two verified volunteers to attend the same charity
shift together, so volunteering doubles as a way to meet people. Success is
two people turning up to a shift together.

## Positioning

Volunteering comes first: people meet through a shift run by a host
organization. The full positioning lives in the private specs.

## Operating Context

- Onboarding asks for location, causes or a specific organization, a short
  profile, partner preferences, availability, and ID verification before a
  first pairing is confirmed.
- After submitting availability the volunteer waits while matching runs;
  the app should always show honestly what it is doing.
- A proposed pairing shows the partner's short profile and the shift, and
  the volunteer confirms before anything is booked or held.
- Deeds are the app's in-app tokens; a confirmed shift places a hold on
  them.
- After a shift, volunteers rate the organization and their partner, and
  can become volunteer buddies.

## Capabilities and Constraints

- Expo SDK 57, React Native, no navigation library (a view stack in
  App.js). Native date inputs use `components/DateField.js`.
- Light mode only today (`userInterfaceStyle: light`).
- Product rules, matching behavior and thresholds live in the private
  specs and in `backend/lib/rules.js` / `backend/matching/config.js`; design
  work must not restate them.

## Brand Commitments

- Name: "In Good Company" (plotline.html also shows "InGood Company";
  which spelling is canonical is undecided).
- Voice in the current copy: plain, warm, second person, short sentences,
  no hype ("When can you go?", "Who we pair you with").
- No visual identity is committed beyond the prototype look in
  specs/plotline.html, which is evidence of the product, not a brand
  commitment.

## Evidence on Hand

- specs/plotline.html: a clickable prototype of most volunteer screens.
- The working app in mobile/ with real copy.
- No real photos, testimonials, partner organizations or metrics are
  approved for design use. Demo people and organizations in comps must be
  made up and labeled as demo content.

## Product Principles

1. Trust before charm: verification, honest status and clear holds come
   before personality.
2. The shift is the hero: the activity and the place lead; the partner is
   met through it.
3. Never leave someone waiting in silence.
4. Confirm before commit: nothing is booked or held without an explicit yes.

## Accessibility & Inclusion

WCAG AA contrast, 44pt (iOS) / 48dp (Android) touch targets, text that
follows the system font size, and safe-area / window-inset aware layouts.
