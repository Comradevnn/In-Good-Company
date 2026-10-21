# Candidate B: Overprint (direction contract)

Comp: `design-candidates/B/index.html` (five frames, plus full-scroll extras 2b, 3b, 4b).
All sizes are px in the comp = pt on iOS = dp/sp on Android (1:1 at 390 wide).

## 1. Name, thesis, world, refusals

**Overprint.** Two bright inks, chunky type and big round shapes: finding a volunteer partner feels like an invitation to something fun with someone, not an admin task.

World: a community print-shop poster run on a risograph. A hot fluorescent pink owns whole regions, a deep ink blue does the job black usually does (all text, buttons, outlines), and a sunny yellow does small jobs. The person on screen is a flat disc in their own colour; where two people's discs overlap, a third solid colour (like two inks overprinting) holds the shift.

Refuses: cream/beige or grey grounds, serif and mono type, small radii, hairline grouped lists, stamps and ticket stubs, confetti, mascots, cartoon faces, emoji, badges-for-everything, blur, gradients, texture.

## 2. Palette tokens

| Token | Hex | Used for |
|---|---|---|
| `ink` | `#0E1280` | All primary text, primary button fill, outlines, icons, the "you" ring/lines, dots |
| `ink-2` | `#3B43A6` | Secondary text and field-row labels on white / tint / pink-tint / yellow-tint (never on solid pink) |
| `ink-3` | `#5058B0` | Placeholder text |
| `pink` | `#FF4F9A` | The committed colour: full-bleed header fields, Home status card, selected chip, switch-on track, Sam's disc, unread dot |
| `pink-tint` | `#FFE3EF` | Safety notice card, plan card |
| `blue` | `#2E3BF0` | Alex's disc (the signed-in user, "you") only |
| `yellow` | `#FFE23D` | Jordan's disc and avatar, Deeds badge, small tags (Daytime, Free plan), notice icon, numeral "5" on ink |
| `yellow-tint` | `#FFF6BF` | Partner card, prototype-stage notice |
| `green` | `#0A7A48` | Overlap lens of you + partner (blue over yellow), success (photo captured) |
| `violet` | `#7B2CD6` | Overlap lens of you + buddy (blue over pink) |
| `tint` | `#EEF0FF` | Default card, list-row and stats surface |
| `edge` | `#6E76D0` | Field, chip and unselected control borders |
| `paper` | `#FFFFFF` | Ground |
| `danger` | `#B3001B` | Error text, error border, error icon |
| `danger-tint` | `#FFE9EC` | Error field fill |
| `off-bg` / `off-fg` | `#E4E6F7` / `#5C62A8` | Disabled button fill / text |
| `on-ink-2` | `#D9DBFF` | Fine print on an ink card |

### Person colour and overlap rule

- **You are always blue** (`blue` `#2E3BF0`), on every screen, for every user. Your disc carries a white person icon, never a letter.
- **Everyone else gets one fixed colour per person**, assigned in order from this pool and then kept forever: yellow `#FFE23D`, pink `#FF4F9A`, mint `#46E0B4`. Their disc carries their initial in ink (ink on mint 8.88, on yellow 11.43, on pink 4.83). Colour follows the person, never the screen or the role.
- **The lens is the pre-mixed overprint of the two inks, a solid hex chosen per pairing, never a blend mode:**
  - you + yellow person: `green` `#0A7A48` (white text/icon 5.40)
  - you + pink person: `violet` `#7B2CD6` (white 6.62)
  - you + mint person: `teal` `#0A6E7A` (white 5.96)
  - two other people with no "you" in the pair (rare, e.g. a buddy pair shown to a third party): `orange` `#FF7A2F` with ink text (ink on orange 5.70)
- **A third person** never makes a three-way overlap (no triple lens). A screen shows lens only for a pair. A group of three or more is a row of 48 discs overlapping by 16, each with a 3px white ring and no lens colour; the shift or org then lives in text beside the row, not in a lens.
- **A person whose colour equals the field colour** (Sam is pink, the Home status card and heroes are pink): that person's disc is never placed directly on its own colour. Show that pairing on a white or `tint` surface (as the buddy row does). If it must sit on a pink field, give the disc a 3px white ring and keep the lens at its own solid colour so the pair still reads. Blue is never a field colour, so your disc is safe everywhere; yellow and mint may sit on pink fields.
- Fields stay pink on hero and status surfaces regardless of who is shown; do not recolour a field to match a person.

AA pairs checked (WCAG relative luminance):
- ink on white 14.82; ink on tint 13.09; ink on pink-tint 12.34; ink on yellow-tint 13.54
- ink on pink 4.83 (body-size text on pink is ink only, never ink-2, never white; white on pink is 3.07 and is not used)
- ink on yellow 11.43; yellow on ink 11.43; white on ink 14.82; on-ink-2 on ink 10.96
- ink-2 on white 8.27; on tint 7.30; on pink-tint 6.89; on yellow-tint 7.56
- ink-3 (placeholder) on white 6.24; on tint 5.51
- white on green 5.40; white on violet 6.62; white (icon) on blue 7.00
- danger on white 7.16; danger on danger-tint 6.18
- off-fg on off-bg 4.50 (disabled, exempt, still held at 4.5)
- edge border on white 4.07 (needs 3:1 as a UI boundary); edge on tint 3.59
- Non-text only (decorative, no AA requirement): green on pink 1.76 and blue on pink 2.28 differ in hue and are never the only carrier of meaning.

## 3. Typography

Families (Google Fonts, 2 only):
- **Gabarito**, weights 700, 800, 900 (exactly the weights in the comp's Google Fonts link): display, headlines, titles, buttons, big numerals. `@expo-google-fonts/gabarito` (`Gabarito_700Bold`, `Gabarito_800ExtraBold`, `Gabarito_900Black`).
- **Figtree**, weights 500, 600, 700: body, labels, field values, links. `@expo-google-fonts/figtree` (`Figtree_500Medium`, `Figtree_600SemiBold`, `Figtree_700Bold`).

Type scale (size / line-height / weight / tracking). Hierarchy is dramatic scale contrast: very large Gabarito heads over small calm Figtree body.

| Role | Family | Spec | Maps to |
|---|---|---|---|
| Display | Gabarito 900 | 56 / 54 / -0.02em (-1.1px) | Big numerals (stats, Deeds); beyond Large Title; Android Display Small |
| Display S | Gabarito 900 | 48 / 52 (wordmark 48 / 48) / -0.02em | Home greeting, wordmark; iOS Large Title (scaled); Android Headline Large |
| Headline | Gabarito 900 | 36 / 40 / -0.015em (ended state uses 40 / 44) | Screen H2; iOS Large Title; Android Headline Medium |
| Title L | Gabarito 900 | 28 / 32 / -0.01em | Section headers, partner name, shift name; iOS Title 1; Android Headline Small |
| Title M | Gabarito 900 | 26 / 30 / -0.01em | Status card title only; iOS Title 1 |
| Title S | Gabarito 900 | 22 / 28 | Plan and safety card titles; iOS Title 2; Android Title Large |
| Subtitle L | Gabarito 800 | 20 / 26 | Card names, top-bar title; iOS Title 3; Android Title Large |
| Subtitle | Gabarito 700 | 18 / 24 | Row labels, "Photo captured"; iOS Headline; Android Title Medium |
| Button | Gabarito 800 | 18 / 24 / +0.005em | iOS Headline; Android Label Large |
| Field value | Figtree 600 | 17 / 24 | iOS Body; Android Body Large |
| Body | Figtree 500 | 16 / 24 | iOS Callout; Android Body Large |
| Body S | Figtree 500 | 15 / 22 | iOS Subheadline; Android Body Medium |
| Label | Figtree 700 | 15 / 20 | Field labels, tags, chips; iOS Subheadline bold; Android Label Large |
| Caption | Figtree 700 | 13 / 18 (used only for 14 / 18 key labels in the shift card) | iOS Footnote; Android Label Medium |

Floors: body 15, nothing below 13 in the comp (spec 12). All sizes in `sp` (RN `allowFontScaling` on); cap `maxFontSizeMultiplier` at 1.3 on Display, Display S and Headline so heads do not collapse the layout.

## 4. Spacing, grid, safe areas

- Scale: 4, 8, 12, 16, 20, 24, 32, 48. Card padding 20 (24 on the ink deposit card). Page margin 24 left and right (342 content width at 390).
- Rhythm: 8 label to input, 16 between fields, 24 to 28 between sections, 32+ before a hero. More space above a heading than below it.
- Footer: 16 top, 24 sides, then the button (56), then the 34 home-indicator zone kept clear. The footer is a white bar with an upward soft shadow.
- Top: 47 status area (inset top), then a 56 top bar. Colour fields run edge to edge under the status bar.
- Controls never enter the bottom 34 (inset bottom) or the top 47. Android: use the same insets via safe-area-context; the pink field extends behind the status bar (edge-to-edge) and the footer pads by the navigation-bar inset.
- Touch: back 48, chips 48, fields 56, buttons 56, links 48 tall, switch row 56, nav rows 64. Non-interactive tags are 32 tall and are not controls.

## 5. Radii and elevation

- Field 20; notice and nav row 24; card 28; hero field bottom 32 (and the sign-in sheet top 32); pill 999 (buttons, chips, tags, badges, switch); circles 50% (back, avatars, icon wells).
- Elevation: almost none by design (borders and tonal fills do the work). One shadow only: the footer bar, `0 -4px 16px rgba(0,0,0,.10)`, Android `elevation: 8` (accept the lighter, downward Android shadow; add a 1px `tint` top border on Android if it vanishes). Everything else is flat, elevation 0.

## 6. Component anatomy

- **Primary button**: 56 tall pill, `ink` fill, white Gabarito 800 18, full width in the footer. Pressed: fill `#080B5C`.
- **Secondary button**: 56 pill, white fill, 2px `ink` border, ink text. **Quiet button / link**: 48 tall, Figtree 700 16 `ink`, 2px underline, offset 4.
- **Disabled primary**: `off-bg` fill, `off-fg` text, no border, no shadow (clearly flat and cool next to the ink button).
- **Text input**: label above (Label 15, ink), field 56 tall, radius 20, 2px `edge` border, white fill, 16 side padding, value Field value 17 ink. Placeholder: Figtree 500 `ink-3`. Masked password: nine-pixel ink dots with 6 gap.
- **Date field**: same field with a 24 calendar icon at the trailing edge; value `1997-06-03`. **Empty**: the text "Choose a date" in the placeholder style, same icon in `ink-3`. **Error**: 2px `danger` border, `danger-tint` fill, trailing alert icon in `danger`, value stays ink; the message sits under the row (see error text).
- **Chip** (single select): 48 tall pill, 2px `edge` border, white fill, Label 15 ink. Selected: `pink` fill, 2px `ink` border, 18px check icon before the label. Chip row: 6 gap, 11 side padding.
- **Toggle**: 56 x 32 track, 2px `ink` border. Off: white track, 16 ink thumb at the left (6 inset). On: `pink` track, 20 ink thumb at the right. Whole row (min 56) is the target.
- **Card**: radius 28, 20 padding, `tint` fill, no border, no shadow. Variants: `yellow-tint` (partner), `pink-tint` (safety, plan), `ink` (deposit).
- **List row (nav)**: 64 tall, radius 24, `tint` fill, 8 gap between rows (no hairlines), 40 white icon circle, Subtitle label, 24 chevron trailing.
- **Status card** (Home): `pink` full card, radius 32, 20 padding, clipped overflow; two half-cropped discs plus a green lens in the top-right corner holding a clock icon; white tag top-left; Title M; Body 600; ink 48 circle with chevron bottom-right. Whole card is the target.
- **Top bar**: 56 tall, transparent over a colour field or white. Back = 48 white circle with 2px ink border and 24 arrow; title Subtitle L, left aligned beside it (works on iOS and Android). Pinned bar on scroll takes the field's `pink`.
- **Section header**: Title L left, link right (48 tall target). 24 above, 4 below before its card.
- **Partner card**: `yellow-tint` card; 64 yellow avatar disc with ink initial; name Title L; meta Body S `ink-2`; Verified badge; quote Body 600 with typographic quotes; tag pills.
- **Notice / info box**: radius 24, `yellow-tint` fill, 36 yellow circle with info icon, Body S ink.
- **Error text**: alert icon 20 + Body S 700 in `danger`, 10 under the field row. Says the problem; recovery is the field itself.
- **Badge**: Verified = 32 pill, white fill, 2px ink border, 18 shield-check icon, Label ink. Deeds badge = 48 yellow pill, coin icon + Gabarito 900 22.
- **Tags**: 32 pill. White (on colour), yellow, ink, or white with 2px ink border (on cards).
- **Upload card (captured)**: radius 28, 2px dashed `green` border, `#E6F7EE` fill, 48 green circle with white check.

## 7. State styles

- Pressed: fills step one shade darker (ink to `#080B5C`, tint to `#DDE1FF`, pink to `#E8397F`); tags and chips do the same; no scale or motion in v1.
- Disabled: `off-bg` / `off-fg`; non-interactive controls drop their border to `off-bg`.
- Focused (field): 2px `ink` border plus a 4px `pink` ring. Build the ring as a wrapping View with 4 padding, radius 24, `pink` background (RN cannot do spread shadows).
- Error: `danger` border + `danger-tint` fill + alert icon + error text.
- Empty: a flat illustration made of the two discs (see expired frame) plus a Headline and Body; never a bare "No data" line.
- Loading: the two discs drift to overlap (static spec: discs at 50% overlap, lens in `green`, Headline underneath "what it is doing"); skeletons are `tint` pills with no shimmer.

## 8. The signature move: the overlap

Each person is a flat disc in a fixed personal colour. Where two discs overlap, a pre-mixed solid lens holds the shift (time or org) as real text.

- Shift proposal hero (frame 4): two 280 px discs (you left with a person icon, Jordan right with initial J), lens 180 wide in green holding the H2 date and time as three lines. Full-bleed pink field.
- Home status card (frame 3): small cropped pair, green lens with clock icon.
- Buddy row (frame 3): 48 px pair, you with person icon, Sam with initial S, violet lens.
- Expired (frame 5): the same two discs pushed apart so they no longer touch; a pink dashed ring marks where the shift was. No added copy.
- Sign in (frame 1): the pair as the brand mark beside the wordmark.

Build in RN: `react-native-svg`. Two `Circle` elements plus one `Path` for the lens (`M mx,cy-h A r r 0 0 0 mx,cy+h A r r 0 0 0 mx,cy-h Z`, `h = sqrt(r^2 - (d/2)^2)`, `mx` = midpoint of centres). Text and icons are normal RN `Text`/`View` absolutely positioned over the SVG so type scales and stays accessible. Wrap in one `DiscPair` component with props `{r, d, colourA, colourB, lens, children}`.

## 9. Where each eyebrow string went

1. Sign in: "Sign in or get started" = white 32 tag on the pink field, top left.
2. Verify your ID: "Verify your ID" = the top-bar title (no kicker above the H2).
3. Home: "We found you a shift" = white tag at the top of the status card; "Free plan" = yellow tag at the top of the plan card.
4. Shift proposal: top-bar title "Shift proposal"; "We found you a shift" = white tag on the pink hero; "The shift" = ink tag at the top-left of the shift card, paired with the yellow "Daytime" tag (sun icon) at the top-right.
5. Proposal expired: none (top-bar title "Your shift").

## 10. Rules for every screen

1. Each screen has one colour field: a pink header that bleeds under the status bar (hero screens), a pink status card, or none on quiet screens. Never more than one pink region plus small pink accents.
2. Text is `ink`, never black or grey. On solid pink, ink only.
3. Headline 36 or Display S 48 once per screen, then jump down to Title L 28 or smaller. Skip the middle sizes.
4. Left-align everything; centre only a quiet link or a button label.
5. One primary action per screen, in the footer above the 34 home zone. Secondary actions are quiet links.
6. A person is always their fixed disc colour; any pairing is two discs plus a solid lens. Never tint a person with another person's colour.
7. Lists are separate tinted rounded rows with 8 gaps; no hairlines, no table grids.
8. Cards never nest; a card holds at most one title, one body block and one row of tags.
9. Icons: 24 grid, 2px round-cap stroke, `ink` (white on blue/green/ink). Draw missing ones to this spec.
10. Radii: pill for anything tappable and small, 20 for fields, 28 for cards, 32 for field edges. No corner under 12.
11. Errors: danger border + tint + icon + one sentence under the field; the screen's primary button stays disabled until fixed.
12. Never let a line end on a separator (middot, dash). Break metadata into one fact per line (org on one line, "Wed, Nov 12 · 6:00 PM" on the next); the joining middot may be dropped when a fact stands alone on its line (as in the hero lens: "Sat, Nov 8" / "9:00 AM" / "– 12:00 PM").
13. Empty or ended screens use the two-disc illustration at 160 to 190 px discs with a Headline and Body; no extra copy.

## 11. React Native feasibility notes

- Fonts: `@expo-google-fonts/gabarito`, `@expo-google-fonts/figtree`, loaded with `expo-font`. Two families, six weights total.
- SVG: `react-native-svg` for the disc pair/lens, the dashed ring (`strokeDasharray`), and the icon set (24 grid paths, one `Icon` component with `name`).
- Shadows: only the footer bar (iOS `shadowOffset {0,-4}`, `shadowRadius 8`, `shadowOpacity .1`; Android `elevation 8`).
- No gradients, blur, blend modes, filters or clip-paths. Overlap colours are solid hexes. Status-card disc cropping uses `overflow: 'hidden'` with radius.
- Dashed borders (upload card) are supported on full uniform borders (`borderStyle: 'dashed'`); the dashed ring uses SVG.
- The pinned top bar on scroll and the footer are plain absolutely positioned Views with safe-area insets.
- Date fields keep using `components/DateField.js`; only the field chrome changes.
- Switch: custom 56 x 32 View track (not the platform `Switch`) so both platforms show the same pink/ink state; set `accessibilityRole="switch"`.
