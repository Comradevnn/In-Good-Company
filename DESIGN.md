---
name: In Good Company
description: Two people, two flat discs, and the shift held where they overlap.
typography:
  display:
    fontFamily: "Gabarito"
    fontSize: "56px"
    fontWeight: 900
    lineHeight: "54px"
    letterSpacing: "-1.12px"
  display-s:
    fontFamily: "Gabarito"
    fontSize: "48px"
    fontWeight: 900
    lineHeight: "52px"
    letterSpacing: "-0.96px"
  headline:
    fontFamily: "Gabarito"
    fontSize: "36px"
    fontWeight: 900
    lineHeight: "40px"
    letterSpacing: "-0.54px"
  title-l:
    fontFamily: "Gabarito"
    fontSize: "28px"
    fontWeight: 900
    lineHeight: "32px"
    letterSpacing: "-0.28px"
  title-m:
    fontFamily: "Gabarito"
    fontSize: "26px"
    fontWeight: 900
    lineHeight: "30px"
    letterSpacing: "-0.26px"
  title-s:
    fontFamily: "Gabarito"
    fontSize: "22px"
    fontWeight: 900
    lineHeight: "28px"
  subtitle-l:
    fontFamily: "Gabarito"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: "26px"
  subtitle:
    fontFamily: "Gabarito"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "24px"
  button:
    fontFamily: "Gabarito"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: "24px"
    letterSpacing: "0.09px"
  field-value:
    fontFamily: "Figtree"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
  body:
    fontFamily: "Figtree"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "24px"
  body-s:
    fontFamily: "Figtree"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "22px"
  label:
    fontFamily: "Figtree"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: "20px"
  caption:
    fontFamily: "Figtree"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: "18px"
rounded:
  field: "20px"
  notice: "24px"
  card: "28px"
  hero: "32px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    height: "56px"
  button-secondary:
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    height: "56px"
  chip:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "48px"
  tag:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
  input:
    typography: "{typography.field-value}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "56px"
  card:
    rounded: "{rounded.card}"
    padding: "20px"
  list-row:
    typography: "{typography.subtitle}"
    rounded: "{rounded.notice}"
    padding: "12px 16px"
    height: "64px"
  notice:
    typography: "{typography.body-s}"
    rounded: "{rounded.notice}"
    padding: "20px"
  status-card:
    typography: "{typography.title-m}"
    rounded: "{rounded.hero}"
    padding: "20px"
---

# Design System: In Good Company

This file records what shipped in the Expo / React Native app (`mobile/`). Sizes are pt on iOS and dp/sp on Android. It describes the visual system only: audience and principles are in `PRODUCT.md`, and product behavior lives in the private specs. Colours are deliberately absent from the frontmatter and named here by role, because they belong to a swappable palette (see Swappable palette). The rationale behind the system is in `design-candidates/B/direction.md` and `design-candidates/B-round2/calm-tonal-shade/scheme.md`; the code wins wherever those differ.

## Overview

**Creative North Star: "Overprint"**

The world is a community print-shop poster: flat shapes, a few inks, chunky type. A person is a flat disc in their own colour, and where two discs overlap, a third solid colour holds the shift, like two inks printed over each other. The app should feel like an invitation to do something with someone, never an admin task.

The default palette, calm tonal shade, turns that poster down without changing how it is built: an aubergine ink does the job black usually does, a heather lavender field owns one region of a screen, cards sit in a pale cool shade, and the ground stays pure white. Hierarchy comes from dramatic scale contrast, very large Gabarito heads over small, calm Figtree text. Depth comes from tonal fills and 2px borders, almost never from shadow.

Motion is deferred; static design.

**Key Characteristics:**
- Two font families, with a wide jump between heads and body.
- One colour field per screen at most, in a white ground.
- Flat tinted cards and rows, large radii, pills for anything small and tappable.
- A person is always a disc; a pair is two discs and a solid lens.
- Every colour is a role token supplied by one palette file.

## Colors

Colours are roles, not values. `docs/THEMING.md` has the full token table; the values for each palette are in `mobile/theme/palettes/`. The default palette is `mobile/theme/palettes/calmTonalShade.js`.

### Primary
- **Ink** (`ink`): all primary text, the primary button fill, outlines, icons and small dots. `ink2` is secondary text; `ink3` is placeholder text only.
- **On ink** (`onInk`, `onInk2`, `onInkLine`): text on ink, fine print on an ink card, and the dashed divider inside one.

### Secondary
- **Field** (`field`): the one committed colour region, either a full-bleed hero or the Home status card. `fieldTint` is its quiet card version.
- **Selected** (`selected`): selected chips, the switch when on, a selected rating, and the focus ring.
- **Accent** (`accent`, `accentTint`): the Deeds badge, small tags, the notice icon well, and large numerals on ink; `accentTint` fills notices.

### Tertiary
- **People** (`you`, `onYou`, `person1`, `person2`, `person3`): disc colours. `you` is reserved for the signed-in user. `person1Tint` fills the partner card.
- **Lenses** (`lens1`, `lens2`, `lens3`, `lensOthers`, `onLens`): the pre-mixed solid overlaps of a pair. `lens1` to `lens3` are you plus person 1, 2 or 3 and carry `onLens`; `lensOthers` is two people who are not you and carries ink.
- **Status** (`success`, `successTint`, `onSuccess`, `danger`, `dangerTint`): confirmed outcomes and errors.

### Neutral
- **Paper and surface** (`paper`, `surface`): the ground, and fields, chips, tags, the back button and icon wells set on it or on a card.
- **Tint** (`tint`): the default fill for cards, list rows and stats.
- **Edge** (`edge`): 2px borders on fields, chips and unselected controls.
- **Off** (`offBg`, `offFg`): disabled fill and text.
- **Small jobs** (`unread`, `ring`, `emptyRing`, `scrollbar`, `shadow`, `statusBar`): the unread dot, the ring around discs, the dashed ring of the ended state, the scroll indicator, and native chrome.
- **Pressed** (`inkPressed`, `surfacePressed`, `tintPressed`, `fieldPressed`, `accentPressed`): derived from each palette in `mobile/theme/palettes/derive.js`, never written by hand.

### Named Rules
**The Colour Follows the Person Rule.** You are always `you`, on every screen. Everyone else keeps one colour, resolved through `mobile/theme/people.js`, whatever the screen or their role on it. Never tint a person with someone else's colour, and never recolour a field to match a person.

**The Solid Lens Rule.** A lens is a chosen solid token, never a blend mode or opacity. There is no three-way lens: a group of three or more is a row of ringed discs with no lens.

**The Ink Is the Black Rule.** Text is the ink family, not black or grey. On the field, text is `ink` only, never `ink2` and never white.

**The One Field Rule.** A screen has one colour field at most: a hero or a status card. Quiet screens have none.

## Typography

**Display Font:** Gabarito (700, 800, 900)
**Body Font:** Figtree (500, 600, 700)

**Character:** Gabarito is round, heavy and friendly, and it carries the poster's voice in heads, numerals and buttons. Figtree stays plain and readable beneath it.

### Hierarchy
- **Display** (Gabarito 900, 56/54): big numerals in stats.
- **Display S** (Gabarito 900, 48/52): the sign-in wordmark and the Home greeting.
- **Headline** (Gabarito 900, 36/40): the screen heading. Ended states step it up to 40/44.
- **Title L** (Gabarito 900, 28/32): section headers, partner and organization names.
- **Title M** (Gabarito 900, 26/30): the status card title only.
- **Title S** (Gabarito 900, 22/28): titles inside cards.
- **Subtitle L and Subtitle** (Gabarito 800, 20/26; 700, 18/24): the top-bar title, then row labels and notice titles.
- **Button** (Gabarito 800, 18/24): button labels.
- **Field value** (Figtree 600, 17/24): values in fields.
- **Body and Body S** (Figtree 500, 16/24; 15/22): reading text. 15 is the floor for body copy.
- **Label** (Figtree 700, 15/20): field labels, chips and tags.
- **Caption** (Figtree 700, 13/18): small scale-end labels. Nothing goes below 13.

Tight Gabarito heads get a little extra top padding on Android so the first line is not clipped; this is built into the type tokens.

### Named Rules
**The Skip the Middle Rule.** One large head per screen, Headline or Display S, then jump down to Title L or smaller.

**The One Fact Per Line Rule.** Metadata breaks into one fact per line. A line never ends on a separator.

## Layout

A single column with a 24 page margin, capped at 560 wide and centred so tablets and foldables do not stretch the fields. Spacing runs on 4, 8, 12, 16, 20, 24, 32, 48: 8 from label to input, 16 between fields, 24 before a section header, and 8 between list rows. Cards pad 20.

Text is left-aligned. Centring is for button labels, quiet links, stat columns and the loading label.

A screen is built from three parts. A 56 top bar or a hero field, a scroll body, and an optional footer holding the one primary action. Hero fields run edge to edge under the status bar and pad for the inset themselves. The footer pads for the bottom inset and rides above the keyboard. On volunteer screens, top bars keep their right end free for the floating Deeds badge; Home draws the same badge inline beside its bell.

Android is edge-to-edge, so every screen frame handles keyboard and insets through the shared frame components in `mobile/components/Controls.js` and `AppParts.js`.

## Elevation & Depth

The system is flat. Tonal fills and 2px borders do the work, and everything sits at elevation 0 except the footer bar.

### Shadow Vocabulary
- **Footer bar** (`footerShadow` in `mobile/theme/tokens.js`): a soft upward shadow on iOS, elevation 8 on Android, where a 1px `tint` top edge keeps the bar's upper boundary visible.

### Named Rules
**The One Shadow Rule.** The footer bar is the only shadow in the app. Cards, rows, chips and notices never cast one.

## Shapes

Everything is round and generous: field 20, notice and list row 24, card 28, hero field bottom edge and status card 32, and pill for buttons, chips, tags, badges and the switch. Back buttons, discs, icon wells and rating choices are full circles. Containers never get small or square corners.

Borders are 2px wherever they appear. Rings around discs are 3px. Dashed lines are a small, deliberate accent: the divider inside an ink card or a Deeds breakdown, the success border on a captured photo card, and the dotted empty ring.

## Components

### Buttons
- **Shape:** 56 tall pill, full width in the footer.
- **Primary:** `ink` fill, `onInk` Button label. Pressed: `inkPressed`.
- **Secondary:** `surface` fill, 2px `ink` border, ink label. Pressed: `surfacePressed`.
- **Disabled:** `offBg` fill, `offFg` label, no border emphasis.
- **Loading:** a spinner replaces the label.
- **Quiet link:** 48 tall target, Figtree 700 16, underlined ink; a `danger` variant exists for destructive links.

### Chips
- **Style:** 48 tall pill, 2px `edge` border, `surface` fill, Label ink.
- **State:** selected adds a `selected` fill, a 2px ink border and a check icon. Chips announce as radio, checkbox or button depending on the set.

### Tags and badges
- **Tag:** a 32 tall pill that is not a control, carrying a fact or a state. Tones: surface, outline, accent, ink. An icon is optional.
- **Verified badge:** an outline tag with a shield-check icon.
- **Deeds badge:** a 48 tall `accent` pill with a coin icon and a Gabarito 900 count.

### Cards / Containers
- **Corner Style:** 28.
- **Background:** `tint` by default; `person1Tint` for the partner, `fieldTint` for plan and safety content, `accentTint` for notices, `ink` for emphasised figures (with 24 padding).
- **Shadow Strategy:** none.
- **Border:** none.
- **Internal Padding:** 20. Cards never nest.

### Status card
The Home summary: a whole-card target at radius 32 in `field`, or `tint` while waiting. Title M, Body 600, and a 48 ink circle with a chevron when it can be tapped. It may carry a small cropped disc pair in its corner.

### Notice
Radius 24, 20 padding, a 36 icon circle beside a title and Body S. Default is `accentTint`, `ok` is `successTint`, `warn` is `fieldTint`.

### Inputs / Fields
- **Style:** Label above, a 56 tall field at radius 20, 2px `edge` border, `surface` fill, Field value in ink, `ink3` placeholder.
- **Focus:** 2px ink border plus a 4px `selected` ring, built as a wrapping view.
- **Error:** `danger` border, `dangerTint` fill, trailing alert icon, and one sentence under the field in Body S bold `danger`.
- **Disabled:** `offBg` border, `offFg` text.
- **Dates:** always `mobile/components/DateField.js`, the same field with a trailing calendar icon and the native picker.

### Toggle
A hand-drawn 56 by 32 track with a 2px ink border, identical on both platforms. Off is `surface` with a small ink thumb at the left; on is `selected` with a larger ink thumb at the right. The whole row, at least 56 tall, is the target.

### Rating
Five number circles up to 56, shrinking evenly on narrow screens, with "Bad" and "Good" captions under the ends. Selected takes `selected` and a 2px ink border.

### Navigation
- **Top bar:** 56 tall and transparent, with a 48 back circle (`surface`, 2px ink border) and a left-aligned Subtitle L title.
- **Onboarding progress:** a row of small pills, outlined when to do and solid ink when done.
- **List row:** at least 64 tall at radius 24 in `tint`, with a 40 `surface` icon circle, Subtitle label, optional Body S sublabel, and a 24 chevron. Rows sit 8 apart with no hairlines.
- **Section header:** Title L on the left, an optional quiet link on the right.

### Icons
One custom set in `mobile/components/Icon.js`: 24 grid, 2px round-cap stroke, no fill. Strokes stay at least 2px when an icon is drawn smaller. Draw missing icons to the same spec.

### The Overlap (signature)
- **Person disc:** a flat circle in the person's colour. Yours carries a person icon in `onYou`, never a letter; everyone else's carries an ink initial. On paper or tint a disc takes a 2px `edge` border so pale colours hold; on a field it does not.
- **Disc pair:** two discs and a lens drawn in SVG. Text and icons over the lens are ordinary views, so they scale and stay accessible. It appears as the hero of a shift proposal, the sign-in brand mark, a cropped pair on the status card, and a small pair in buddy rows.
- **Disc pair apart:** the same two discs pushed apart, with a dotted `emptyRing` where the shift was. This is the empty and ended state, with the person icon and the initial on the discs.
- **Disc row:** three or more discs overlapping by 16, each with a 3px `ring`, and no lens.

### States
- **Pressed:** one shade darker through the derived pressed tokens. No scale change.
- **Disabled:** `offBg` and `offFg`.
- **Error:** border, tint, icon and one sentence. A failed primary action shows its error above the button in the footer.
- **Empty:** the discs apart with a Headline and Body, never a bare "No data" line.
- **Loading:** two discs at half overlap with a lens, an optional Title L label saying what is happening, and a small spinner.

## Do's and Don'ts

### Do:
- **Do** use role tokens from `mobile/theme/colors.js` for every colour.
- **Do** keep one primary action per screen, in the footer.
- **Do** build lists as separate tinted rows 8 apart.
- **Do** resolve person and lens colours through `mobile/theme/people.js`.
- **Do** use the two-disc states for empty, ended and loading screens.
- **Do** put shift text over a lens as real, scalable text.

### Don't:
- **Don't** write a colour value outside `mobile/theme/palettes/`.
- **Don't** add a shadow other than the footer bar's.
- **Don't** use gradients, blur, texture, or blend modes.
- **Don't** use hairline dividers between list rows or table grids.
- **Don't** put a tag or small label above a heading to introduce it; the heading carries itself.
- **Don't** use serif or mono type, or a third family.
- **Don't** use emoji, mascots or cartoon faces.
- **Don't** nest cards.
- **Don't** add a third lens or blend three people into one overlap.

## Swappable palette

The app's colours swap as a whole. See `docs/THEMING.md`.

- **To change palette:** edit the one-line `DEFAULT_PALETTE` constant in `mobile/theme/colors.js`, or set `EXPO_PUBLIC_PALETTE=<name>` when starting Metro.
- **The rule:** no hex, rgb or named colours outside `mobile/theme/palettes/`. This is enforced by `mobile/theme/palettes.test.mjs`. That test also checks every palette for the same keys, WCAG contrast, and colour-blind separation of people and lenses.

## Accessibility floors

- Contrast is WCAG AA for text and 3:1 for UI boundaries, checked per palette by the palette test.
- Touch targets are at least 48 for back buttons, chips and links, and 56 for fields, buttons and switch rows. Tags are 32 because they are not controls.
- Text follows the system font size. Display, Display S and Headline stop growing at 1.3x, as do button and tag labels.
- Layouts respect safe areas and window insets. Android layout and keyboard behavior are checked as closely as iOS.
- Colour is never the only signal: discs carry an icon or initial, errors carry an icon and a sentence, and selected chips carry a check.
- Headings announce as headers, controls announce their role and state, and disc artwork is hidden from screen readers unless it is given a label.
