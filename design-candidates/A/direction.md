# Candidate A: Field Day (direction contract)

Source of truth for the look is `index.html` in this folder. This file is written so a builder can adopt the direction without reading the comp's source. High level only; nothing here comes from the private specs.

## 1. Name, thesis, world, refusals

**Field Day.** A civic games-identity program for doing good: a calm, systematic, cheerful public-information language, where colour is a code and every shift is a block on the day.

**World.** The great 1970s sports-event identity programs: a cool pastel spectrum on white, one grotesque typeface, strict pictograms, colour used as a code rather than decoration, and signage-style information design. A stranger-meeting app borrows that organisation so that it feels run by someone competent: everything has a place, a colour and a symbol.

**Refuses.** Warm or cream grounds, serif type, hot fluorescent colour fields, pills and round blobs, stamps and perforations, big-number hero metrics, grey-card-plus-one-blue-accent dashboard look, shadows as decoration, and any gradient or texture.

## 2. Palette tokens

Cool, light, white ground. Roles: **cause code** (sky, meadow), **status code** (aqua = verified and safety, violet = Deeds), **action** (ink), **neutral** (silver), one **warm signal** for warnings and errors only. Each spectrum colour has four tones: 100 (tint surface), 300 (band fill, pastel), 600 (solid mark, strip block, at least 3:1 on white), 700 (icon and small text on its tint).

| Token | Hex | Used for |
|---|---|---|
| `ink` | `#0F2A4A` | text, primary button, selected chip, reversal bands, switch on |
| `ink-2` | `#3D5170` | secondary text, captions, section labels |
| `ink-3` | `#596A82` | placeholder text, chevrons, ended-state icon |
| `white` | `#FFFFFF` | task and form screens, cards, bars, inputs |
| `ground` | `#F1F4F8` | grouped hub screens (Home, Shift proposal), strip track, notice box |
| `fill` | `#E3E8EE` | avatars, neutral tags, disabled button |
| `rule` | `#CFD7E1` | hairlines (1px) |
| `ctl` | `#78879A` | control borders, switch off track (`#7F8DA0`), ended strip |
| `tick` | `#9AA7B8` | hour ticks, scroll indicator |
| `sky-100/300/600/700` | `#E6F3FC / #A9D6F5 / #2F8FD8 / #17608F` | **Animal welfare**; the shift-card band; focus ring (600) |
| `meadow-100/300/600/700` | `#E4F5E8 / #A6DDB2 / #2E9E55 / #1B6B38` | **Food insecurity** |
| `violet-100/300/600/700` | `#EDEBFA / #C5BDF0 / #6A5BD0 / #4B3DAE` | **Deeds** (badge, deposit box, nav tiles for Deeds and Premium) |
| `aqua-100/300/600/700` | `#DDF4F2 / #9BDDD6 / #1E9C94 / #0E6F6A` | **Verified**, safety notice, "photo captured" |
| `signal` / `signal-100` | `#B8400A` / `#FCEBE3` | errors, expired date field, unread dot. Nothing else. |

Cause colours extend by the same rule: each future cause gets one tone set from the same cool family (extra aqua-adjacent, silver-blue). Never a warm hue.

Contrast pairs checked (WCAG relative luminance):

- ink on white 14.48; ink on ground 13.12; ink on sky-100 12.82; ink on aqua-100 12.62; ink on violet-100 12.32
- white on ink 14.48 (primary button, reversal band, selected chip)
- ink-2 on white 8.05; on ground 7.30; on fill 6.53; on sky-100 7.12; on meadow-100 7.10; on aqua-100 7.01; on violet-100 6.85
- ink-3 (placeholder) on white 5.51
- ink on sky-300 9.39; on meadow-300 9.38; on violet-300 8.21; on aqua-300 9.45 (band labels, tiles)
- sky-700 on sky-100 5.98; meadow-700 on meadow-100 5.78; violet-700 on violet-100 6.93; aqua-700 on aqua-100 5.23
- signal on white 5.56; signal on signal-100 4.80
- non-text, at least 3:1 on white: ctl border 3.66; switch off track 3.38; sky-600 3.48; meadow-600 3.42; aqua-600 3.37; violet-600 5.22

## 3. Typography

One family: **Archivo** (Google Fonts), weights 400, 500, 600, 700, 800. Package: `@expo-google-fonts/archivo` (`Archivo_400Regular`, `Archivo_500Medium`, `Archivo_600SemiBold`, `Archivo_700Bold`, `Archivo_800ExtraBold`). Rank is carried by **weight, case and reversal**, not size. The scale is deliberately narrow: five sizes, the largest 1.6x body. Sizes are sp/pt; set `allowFontScaling` on all text and cap the multiplier at 1.3 for display and labels so bands and tabs do not break.

| Role | Size / line | Weight | Tracking | Case | iOS style | Android role |
|---|---|---|---|---|---|---|
| display | 24 / 28 | 800 | -0.01em | sentence | Title 1 (custom 24) | Headline Small |
| title | 18 / 24 | 700 | -0.005em | sentence | Title 3 | Title Large |
| headline | 15 / 20 | 700 (600 for links and field values) | 0 | sentence | Headline | Title Medium |
| body | 15 / 21 | 400 | 0 | sentence | Body | Body Large |
| caption | 13 / 18 | 500 (600-700 for field labels, key names) | 0 | sentence | Footnote | Body Small / Label Medium |
| label | 12 / 16 | 700 | +0.06em | UPPERCASE | Caption 1 | Label Small |

Buttons are headline at +0.01em. Numerals in stats and Deeds use display or title at 800. Never go below 12. Uppercase is for band labels, section labels and badges only, applied with `textTransform`, never typed into the string.

## 4. Spacing, grid, safe areas

- Scale: 4, 8, 12, 16, 20, 24, 32. Compact rhythm: 12 between related fields, 16 between groups, 20 before a section label.
- Margins: 16 left and right, everywhere. Card inner padding 16 (12 for dense rows). Row heights 48 (56 for two-line rows).
- Grouped list: cards sit inside the 16 margin, rows separated by 1px hairlines, no inset-dividers beyond the card edge.
- Safe areas: status area 47 at the top (Home status bar white), 34 clear at the bottom (home indicator; on Android, the nav-bar inset). Footer buttons sit above that zone in a white footer with a 1px top rule, 8 top and bottom padding. Scroll content clips at the footer, never under the home indicator.
- Touch targets: 48 minimum for every control (44 only for small text links that also have 48 of row height around them in context). Visible chips are 44 tall, inputs 48, buttons 52.

## 5. Radii and elevation

- Radii: 2 (strip block, tags, track), 4 (buttons, inputs, chips, cards, tiles, avatars, notices). Nothing above 4. The switch is the one native-shaped exception (pill, platform standard).
- Elevation: flat by default; borders and tonal fills do the separating. The only shadow is the switch knob: `0 1px 2px rgba(15,42,74,.35)`, Android `elevation: 2`. Cards, footers and bars use a 1px hairline instead of any shadow (elevation 0).

## 6. Component anatomy

- **Primary button:** 52 tall, ink fill, white headline text, radius 4, full width in the footer. **Secondary:** white fill, 1.5px ink border, ink text. **Quiet:** text link, headline 600, ink, 1px underline with 3px offset, 48 tall row.
- **Text input:** label above (caption 700, 6 gap), field 48 tall, 1px `ctl` border, radius 4, white fill, body-weight 500 value. Placeholder is `ink-3` weight 400. Focus: 2px sky-600 border.
- **Date field:** same field with a 46-wide calendar cell on the right, separated by a 1px left rule, so the whole thing reads as tappable and opens the OS picker. **Filled:** value `YYYY-MM-DD`. **Empty:** the text "Choose a date" in the placeholder style, same calendar cell. **Error:** 2px signal border, signal-100 fill, signal divider; the message sits directly below the row in caption 700 signal with a diamond alert icon.
- **Chip (single select):** 44 tall, 14 side padding, radius 4, 1px `ctl` border, headline 600. **Selected:** ink fill, white text, leading check icon (reversal).
- **Toggle:** native switch, 52 x 32, 24 knob. Off: `#7F8DA0` track, white knob. On: ink track, knob right. Hit area 56 x 48 inside a 56-tall row.
- **Card:** white, 1px `rule`, radius 4, no shadow, no nesting. A card may have a full-width band (40 tall, label role) as its header.
- **List row:** 48 tall, 16 side padding, 1px top hairline, 28 icon tile (radius 4, 100-tone fill, 700-tone icon) or 36 avatar, headline label, trailing chevron in `ink-3`.
- **Status card:** card with an ink reversal band (label role, white, leading pair icon, trailing chevron when tappable), then title, body and a day strip.
- **Top bar:** 48 tall, white, 1px bottom rule, 48 x 48 back button (arrow icon) left, centered headline title, matching 48 slot right. Hub screens: left-aligned title (the weekday), actions right, display title below.
- **Section header:** label role (uppercase, ink-2) 44 tall, optional trailing link (caption 700 underlined, 44 hit area).
- **Partner card:** card, 48 square initial avatar (`fill`, display weight), title name line, caption meta, Verified badge right, quoted bio in body, tags below.
- **Notice / info box:** `ground` fill, 1px `rule`, radius 4, info icon (square with i) and body text. Safety notice is the aqua variant: aqua-300 band with shield icon and title, aqua-100 body, square CSS bullets, and the "I've read this" switch row on white at its foot.
- **Error text:** caption 700 signal, 16px alert icon, names the problem. **Helper:** caption 500 ink-2.
- **Badge (Verified):** 28 tall, aqua-100 fill, inset 1px aqua-300, shield-check icon aqua-700, label role text. **Deeds badge:** 32 tall, violet-100 fill, 1px violet-300, coin icon violet-700, title-weight ink value, inside a 48 tap area. **Tag:** 24 tall, label role, 100-tone fill with a 6-8px swatch square of the 600 tone.

## 7. State styles

- **Pressed:** buttons and rows darken one step (ink to `#1B3A60`; row fill to `ground`); chips and links to `ground` background. No scale or motion.
- **Disabled:** `fill` background, ink-2 text, 1px **dashed** `ctl` border (so disabled reads without relying on contrast loss). No opacity fade.
- **Focused:** 2px sky-600 border on inputs; 2px sky-600 outline offset 2 on other controls.
- **Error:** signal border 2px, signal-100 fill, message below. Never colour alone: the alert icon accompanies the message.
- **Empty:** the day strip with a dashed, hollow block on a white track holding a pictogram from the set (see the expired screen). No added copy.
- **Loading:** a day strip whose block is `fill` coloured and sized as a placeholder, plus honest text from the screen's own copy; skeletons use `fill` blocks with radius 2.

## 8. The signature move: the day strip

**What:** every shift time is also drawn as a thin horizontal strip on a fixed 6 AM to 10 PM scale: a `ground` track with a 1px hairline, hour ticks underneath (17 ticks, majors at 6 AM, 12 PM, 6 PM, 10 PM taller), and the shift as a solid block in its cause colour (sky-600 Animal welfare, meadow-600 Food insecurity). Block left = (start - 6) / 16, width = duration / 16.

**Where:** small (18 tall) on the Home status card and the Upcoming card; large (32 tall, with end and quarter labels 6 AM, 12 PM, 6 PM, 10 PM, and a sun icon in the block for a Daytime shift) on the Shift proposal card; extra large (80 tall, full content width) and ended (white track, dashed hollow block holding the hourglass pictogram, no labels) on Proposal expired, placed in the upper third and grouped with the heading and body-size rationale as the empty-state illustration.

**RN build:** a container `View` with `flexDirection: column`; the track is a `View` with `position: relative`, fixed height and border; the block is an absolutely positioned `View` with `left` and `width` as percentage strings; ticks are 17 absolutely positioned 1px `View`s in a 9px tall row below (or computed from `onLayout` width). Labels are absolutely positioned `Text`s. No SVG needed. Wrap in a single `DayStrip({start, end, cause, size, ended})` component.

**Pictograms:** the icon set is drawn on a 24 grid, 2px stroke, square caps, mitre joins, 45 and 90 degree strokes only. Cause pictograms (paw for Animal welfare, bowl for Food insecurity) sit in a 100/300-tone tile next to the cause.

## 9. Where each eyebrow string went

| String | Screen | Job |
|---|---|---|
| Sign in or get started | Sign in | top-bar title (centered), over the four-colour spectrum rule |
| Verify your ID | Verify your ID | top-bar title |
| Thursday | Home | top-bar title (left), the weekday; display title "Hi, Alex" below |
| We found you a shift | Home | ink reversal band label inside the status card |
| Free plan | Home | ink tag at the top of the plan card |
| We found you a shift | Shift proposal | full-width ink status band directly under the top bar |
| The shift | Shift proposal | label inside the sky band of the shift card |
| Daytime (with sun icon) | Shift proposal | right side of the same band, and the sun icon in the strip block |
| Your shift | Proposal expired | top-bar title |

Section titles (Upcoming, Your buddies, Your impact) are section labels (uppercase, ink-2), not kickers; each heads its own card.

## 10. Rules for every screen

1. White ground for task and form screens; `ground` (`#F1F4F8`) with white cards for hub and detail screens. Status bar and bars are always white.
2. Top bar on every pushed screen: 48 tall, back button left, centered headline title, hairline under. Large display title only on hub screens.
3. One H2 per screen at display (24/800). Hierarchy comes from weight, case and reversal; do not add sizes.
4. Colour is code: sky and meadow mean cause, aqua means verified or safe, violet means Deeds, ink means act, signal means warning. Never use one for decoration.
5. Any time or shift gets a day strip. Any cause gets its pictogram tile. Any new status gets a reversal band, a tag, or a 100-tone box, never a new colour.
6. Cards are flat: 1px hairline, radius 4, no shadow, never nested. Prefer a grouped list (rows with hairlines) over a stack of separate cards.
7. One primary action per screen, in a white footer above the home-indicator zone. Secondary actions are quiet underlined links, 48 tall.
8. Form fields are 48 tall with the label above; pairs sit side by side with a 12 gap; errors appear directly under the field they belong to, with the alert icon.
9. Uppercase 12/700 with +0.06em tracking is only for bands, section labels and badges.
10. Icons come from the one set (24 grid, 2px stroke, square caps, 45/90 degree strokes). No emoji, no Unicode arrows or ticks. Bullets are 6px square Views.
11. Every touch target is at least 48 (44 for chips' visible height, with row spacing around); nothing interactive in the bottom 34.
12. Never add copy to an ended or empty state; use the strip and a set icon.

## 11. React Native feasibility notes

- Fonts: `@expo-google-fonts/archivo` only (five weights above), loaded with `useFonts` from `expo-font`; map each weight to its own family name (React Native does not synthesize weights from one file).
- SVG: icons need `react-native-svg` (already common with Expo); each is a few `Path`/`Rect` elements with `strokeLinecap="square"`, `strokeLinejoin="miter"`, `strokeWidth={2}` on a 24 viewBox, colour via `currentColor`-style prop. The day strip itself needs no SVG.
- Shadows: only the switch knob; use `elevation: 2` on Android and `shadowOffset {0,1}`, `shadowRadius 2`, `shadowOpacity .35` on iOS. Use the platform Switch with `trackColor`/`thumbColor` where it matches, otherwise this custom view.
- Dashed borders: `borderStyle: 'dashed'` on a full border (disabled button, ended strip block); both are uniform on all four sides, which RN supports.
- Overlap: the wordmark mark is three absolutely positioned solid `View`s (sky, meadow, and an aqua overlap rectangle) - no blend.
- No gradients, blur, filters, blend modes, patterns or clip-paths are used. The sign-in spectrum rule is four flex `View`s.
- Text: `textTransform: 'uppercase'` and `letterSpacing` are supported. Use `fontVariant: ['tabular-nums']` for stat and time numerals where Archivo supports it.
- Dates: native date inputs continue to use `components/DateField.js`; this direction only restyles its chrome (calendar cell, error border).
