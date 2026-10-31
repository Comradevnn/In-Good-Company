# Candidate C: "Carbon Copy" (direction contract)

Source of truth for the comp: `index.html` in this folder. This file is written so a builder can adopt the direction on all screens without reading the comp's source. High level only; nothing here restates private product specs.

## 1. Name, thesis, world, refusals

**Carbon Copy.** The volunteer sign-up sheet and the paper ticket, made trustworthy and warm: coloured multi-part form stocks, deep carbon ink, an editorial serif voice, and a shift you hold like a ticket with a tear-off stub, whose state is stamped onto it instead of disappearing.

**World.** A neighbourhood's own printed matter: the church-hall sign-up sheet, the carbonless duplicate pad, the raffle or event ticket. Each screen region is a sheet of a different stock (canary, salmon pink, pale white copy), written in deep carbon ink, with a rubber stamp for anything that changes state. It borrows the form's grammar (ruled boxes, labelled fields, stubs, stamps), never its dirt.

**Refuses.** Cream, ivory, parchment or beige paper (the stocks are clearly yellow and pink); italic display serifs, hairline-and-tracked-mono "editorial" defaults; pills and circles as decoration; geometric sans display; pastel spectrum; hot fluorescent inks; paper textures, torn edges, coffee stains, handwriting fonts; blur, gradients, glow, blend modes; labelling anything twice.

## 2. Palette tokens

| Token | Hex | Where used |
|---|---|---|
| `ink` | `#261A5E` | All primary text, borders and rules (2px/1.5px), primary button fill, selected chip, switch (on), Deeds badge fill, icons |
| `ink-2` | `#453C7C` | Secondary text: ledes, field labels, meta lines, fine print |
| `ink-3` | `#5A5486` | Placeholder text, disabled button text and dashed border. Never on pink |
| `canary` | `#F6E381` | Sign-in ground, Home header band, ticket coupon, notice and safety boxes, partner avatar and tags, primary button label |
| `canary-deep` | `#E9D262` | Pressed state of canary surfaces |
| `pink` | `#F2B9AE` | Verify-ID header band, Shift proposal and expired ground, Home plan card |
| `pink-deep` | `#E7A89C` | Pressed state of pink surfaces |
| `paper` | `#F8F8FB` | "White copy": body ground of long screens (Verify body, Home body) |
| `white` | `#FFFFFF` | Input fill, ticket stub, cards, chips (unselected), icon buttons |
| `stamp` | `#A32109` | Vermilion. STATE ONLY: error text and border, and stamps for settled states ("Held" once confirmed, "Expired"). Never decoration, never a button |
| `dis` | `#E3DDE6` | Disabled button fill |
| `rule-soft` | `#CFCAE0` | Row dividers inside lists, blank ruled lines on a voided ticket |

Colour strategy: full palette with page-scale fields. A screen region is one stock; the ticket always sits on a different stock than its ground, and its notches use the ground colour.

Contrast pairs checked (WCAG ratios, computed):

- `ink` on `canary` 11.66, on `pink` 8.86, on `paper` 14.23, on `white` 15.09
- `ink-2` on `canary` 7.41, on `pink` 5.63, on `paper` 9.04, on `white` 9.59
- `ink-3` (placeholder) on `white` 6.89, on `paper` 6.50, on `canary` 5.32. Fails on pink (4.05): do not use there
- `canary` on `ink` (button label, Deeds badge) 11.66; `white` on `ink` (selected chip, badge) 15.09
- `ink-3` on `dis` (disabled label) 5.17
- `stamp` on `white` 7.56, on `paper` 7.13, on `canary` 5.84. On `pink` 4.44: stamps are 20px+ bold (large text, 3:1 needed) and are placed on white or canary in the comp; keep body-size stamp text off pink
- Non-text: 2px ink borders on every stock exceed 8:1; switch track border (ink) on canary 11.66

## 3. Typography

Two families, both Google Fonts.

- **Besley** (serif, Clarendon-style, upright, sturdy): the voice. Headings and body copy. Weights used: 400, 700. Package `@expo-google-fonts/besley` (`Besley_400Regular`, `Besley_700Bold`).
- **Barlow Condensed** (condensed grotesque): field labels, buttons, figures, section headers, stamps, chips, top-bar titles. Weights used: 500 (reserve), 600, 700. Package `@expo-google-fonts/barlow-condensed` (`BarlowCondensed_600SemiBold`, `BarlowCondensed_700Bold`; add `_500Medium` only if needed).

Sizes are px in the comp = pt on iOS = sp on Android. Body copy follows Dynamic Type / font scale; keep line-height proportional (about 1.4) and let rows grow.

| Role | Family / weight | Size / line | Tracking | iOS style | Android role |
|---|---|---|---|---|---|
| display (Home greeting) | Besley 700 | 34 / 40 | -0.01em | Large Title | Display Small |
| h2 (screen heading) | Besley 700 | 28 / 34 | -0.005em | Title 1 | Headline Medium |
| title (ticket org name, partner name) | Besley 700 | 22 / 28 | 0 | Title 2 | Title Large |
| ticket-title | Besley 700 | 20 / 26 | 0 | Title 3 | Title Large |
| headline (card titles) | Besley 700 | 18 / 24 | 0 | Headline | Title Medium |
| body | Besley 400 | 16 / 24 | 0 | Callout | Body Large |
| small (ledes, descriptions, links) | Besley 400 | 15 / 22 | 0 | Subheadline | Body Medium |
| fine (fine print, helper) | Besley 400 | 14 / 20 | 0 | Footnote | Body Small |
| field value | Besley 400 | 17 / 24 | 0 | Body | Body Large |
| label (field label, tags, meta) | Barlow Condensed 600 | 16 / 18-20 | +0.02em | Callout | Label Large |
| section label | Barlow Condensed 700 | 18 / 22 | +0.03em | Headline | Title Small |
| button | Barlow Condensed 700 | 20 / 24 | +0.03em | Headline | Label Large |
| figure (stats, deposit) | Barlow Condensed 700 | 32-36 / 32-36 | +0.01em | Title 1 | Headline Medium |
| stamp | Barlow Condensed 700, UPPERCASE | 20 (44 on expired) | +0.1em | Callout | Label Large |

No text under 14px. Labels are sentence case (never tracked mono, never small caps above a heading).

## 4. Spacing, grid, safe areas

- Scale (4pt base): 4, 8, 12, 16, 20, 24, 32, 40. Tokens `s1..s10`.
- Screen margin 20. One column. Inner gaps: 12 between stacked fields, 8 between a label and its control, 16 inside cards, 24 between sections, 32-40 before the first heading under a bare top bar.
- More space above a section than below its heading: section header row is 44 tall with a 2px rule; content follows at 12.
- Safe areas: top inset 47 on iPhone-class (use real inset on device, status bar region takes the ground colour of the top bar). Bottom 34 zone is kept clear: scroll content ends above it, the footer button sits above it, and it takes the ground colour (draw the indicator over a clean strip, never over text). On Android edge-to-edge apply the status and navigation bar insets the same way and add the IME inset to the footer.
- Footer: 12 vertical padding, 20 horizontal, 1.5px ink rule on top, 56 tall button.
- Touch targets: every control 48 tall (chips, buttons, icon buttons, text links, switch row 56). Metadata tags and badges are not controls and are 28 tall.

## 5. Radii and elevation

- Radius: 2px on boxes, buttons, chips and inputs. 0 on tickets, cards and avatars (avatars are squares). The only round shapes are the ticket notches, the switch (a native-shaped control, 52x32), and the masked-password dots.
- Elevation: none. Hierarchy comes from stock colour and 2px ink rules, so there are no shadows and Android `elevation` is 0 everywhere. If a floating element is ever needed, use one neutral `0 2px 6px rgba(38,26,94,.18)` = `elevation: 2`.
- Borders: 2px ink for tickets and boxes in the comp (RN `borderWidth: 2`; 1.5 is also fine). Dashed borders only on full boxes (disabled button) or the perforation View.

## 6. Component anatomy

- **Primary button**: 56 tall, full width, `ink` fill, `canary` label (Barlow Condensed 700 20), radius 2. One per screen, in the footer above the safe zone.
- **Secondary button**: 56 tall, transparent, 2px ink border, ink label.
- **Quiet button / text link**: no box, Besley 15 underlined (offset 3), 48 tall hit area, centred under a primary or left-aligned in a form. Inline links in section headers use Barlow Condensed 600 16 underlined.
- **Text input (form box)**: white fill, 2px ink border, radius 2, min height 64. Label sits small inside the top-left (Barlow Condensed 600 16, `ink-2`), value below (Besley 400 17, `ink`). Placeholder uses `ink-3` in the value slot (e.g. "At least 8 characters", "Jordan Michael Smith", "As printed on the document"). Masked password: 8px ink dots in the value slot. Two boxes can sit side by side with a 12 gap (flex 1:1, or 5:3 for number plus country).
- **Date field**: same form box in a row, value left (`1997-06-03`), calendar icon right (24, ink). Tapping opens the native picker (`components/DateField.js`). Empty: value slot reads "Choose a date" in `ink-3`, the calendar icon stays ink. Error: 2px `stamp` border, label turns `stamp`, value stays ink, and the message sits directly under the row (see error text).
- **Chip** (single select): 48 tall, 14 side padding, white fill, 2px ink border, Barlow Condensed 600 17. Selected: `ink` fill, white label, leading 20px check icon. Chips wrap on narrow widths.
- **Toggle**: native-shaped switch 52x32. Off: white track, 2px ink border, ink thumb left. On: ink track, canary thumb right. Row min height 56, label Besley 700 17 on the left.
- **Card**: white fill, 2px ink border, square, 16 padding. No nested cards. Optional canary or pink fill for notices and plan cards.
- **List row**: min 56 tall, Besley 400 17 label left, chevron icon (24) right, 1px `rule-soft` divider, last row closed with a 2px ink rule. Buddy rows use a 48 square avatar (pink fill, ink border, Besley 700 initial) plus name (Besley 700 17) and meta (Besley 15 `ink-2`), min 72 tall.
- **Status card**: a compact ticket (see section 8): canary coupon with the label, title and body, white stub on the right carrying a chevron. A proposal is unsettled, so it is not stamped. The whole ticket is the tap target.
- **Top bar**: 56 tall, ground colour of the screen's top region. 48 square back button (white fill, 2px ink border, arrow icon) at the 20 margin, then the screen title in Barlow Condensed 600 18 (left aligned on both platforms in the comp; centre it on iOS if the platform convention is preferred, keep the box button). No bar on Home; Sign-in shows the wordmark (Besley 700 21) in its place.
- **Section header**: row 44 tall, label left (Barlow Condensed 700 18), optional link right, 2px ink rule beneath. Replaces any separate "heading plus divider".
- **Partner card**: white card. Row of 56 square avatar (canary fill, Besley 700 26), name line "Jordan, 29" (Besley 700 22) over meta (Besley 15 `ink-2`), badge on the right. Quote in Besley 400 16 with curly quotes. Tags as 28-tall canary boxes with Barlow Condensed 600 16 labels.
- **Notice / info box**: canary fill, 2px ink border, 16 padding. Info icon (square) at left for a plain notice. The safety variant is a column: Besley 700 18 title, square-bullet list (7px ink squares), then a hairline and the "I've read this" switch row.
- **Error text**: `stamp`, Besley 700 15/22 with an alert icon (20) before it, 8 under the field row.
- **Badge**: 28 tall, `ink` fill, white Barlow Condensed 600 16 label, 18px icon (e.g. verified shield with check) in front. Free-plan tag uses the same badge.
- **Deeds badge**: 48 tall, ink fill, canary coin icon and Barlow Condensed 700 24 figure. Notification button beside it is the 48 white icon button with a 10px ink square unread marker (white 2px edge) at its top right.

## 7. State styles

- **Pressed**: canary surfaces go to `canary-deep`, pink to `pink-deep`, white to `paper`; primary button to `#3A2D80` (ink lightened). No scale or ripple dependence; Android ripple in `ink` at 12% is fine.
- **Disabled**: `dis` fill, 2px dashed `ink-3` border, `ink-3` label (reads as an unprinted slot). No opacity fade. Pair with the reason being visible on screen (e.g. the "I've read this" switch is off above it).
- **Focused** (keyboard, switch access): 2px ink border becomes 3px ink with a 3px canary outer ring (a wrapper View with canary border) on pink and paper; on canary use a white ring.
- **Error**: `stamp` border (2px), `stamp` label and message with alert icon. Never colour the value itself. Errors on tickets are expressed with a stamp, not red text.
- **Empty**: a ruled blank (white box, `rule-soft` lines) rather than an illustration; placeholders in `ink-3`; the expired screen shows a voided blank ticket.
- **Loading**: skeleton is a ruled blank (a white box with `rule-soft` lines) in the shape of the real content; for waits that matching runs, show a ticket whose coupon text is honest ("what we're doing") with a stamp-less stub. No spinners on tickets.
- **Selected**: ink fill, white label, check icon (chips); `canary` fill is for notices and tickets only, not selection.

## 8. The signature move: the ticket stub

**What.** A proposed or confirmed shift is a ticket: a canary coupon (org, when, where, task) joined by a dashed perforation to a white stub (the Deeds hold, or the partner). The perforation has two half-circle notches cut into the edges, drawn as Views in the ground colour. State is stamped onto the ticket as a rotated, outlined vermilion stamp whose word already appears on that screen's own copy. Nothing disappears: it gets stamped.

**Where it appears in the comp.**
- Home status card (compact, side stub): coupon label "We found you a shift", title, body; the stub carries only a chevron. It is deliberately unstamped: a proposal holds nothing yet, and a red "Held" would read as Deeds already taken.
- Home Upcoming item (compact, side stub): coupon holds the shift and org; stub names the partner ("With Sam").
- Shift proposal (full ticket, bottom stub): an ink header strip carries "We found you a shift"; coupon is the shift card; the stub is the deposit box, reading "Held from your Deeds when you confirm" with the figures. No stamp yet, because nothing is held until the user confirms; on confirm the stub gets the stamp.
- Proposal expired: the coupon loses its stock colour (white, voided, blank ruled lines), is stamped "Expired" (word taken from the heading), and the stub is torn off and lies below, rotated about 2 degrees, carrying the coin icon: the Deeds are back.

**How to build in RN.**
- `Ticket`: a `View` with `borderWidth: 2, borderColor: ink`, `overflow: 'visible'`. Children: `Coupon` (canary, padding 16), a perforation, `Stub` (white). Side variant is `flexDirection: 'row'` with a fixed 96 wide stub; full variant is a column.
- Perforation: an absolutely positioned or in-flow `View` of height 0 / width 0 drawing a dashed line. React Native only dashes full-box borders, so use the standard trick: wrapper `height: 2, overflow: 'hidden'`, inner `View` `height: 6, borderWidth: 2, borderStyle: 'dashed', borderColor: ink`.
- Notches: two 24x24 `View`s, `borderRadius: 12`, `backgroundColor` = the ground colour behind the ticket (pass it as a prop), absolutely positioned centred on the ticket's outer border at the perforation (`left: -13` / `right: -13`, `top: -13` relative to the perforation). Because they are solid ground colour, no masking or SVG is needed. The ticket must sit on a flat ground.
- Stamp: a `View` with `borderWidth: 2, borderColor: stamp, borderRadius: 2`, padding 4/8, `transform: [{ rotate: '-8deg' }]`, text Barlow Condensed 700 20, `textTransform: 'uppercase'`, `letterSpacing: 2`, transparent background. Big variant 44 / 3px border for the expired screen.
- Stamp words must come from that screen's own copy: do not invent stamp text. Stamp only states that have already happened: held (after the user confirms), expired, error. Never stamp a proposal or any pending state. On future screens the same rule holds: stamp a confirmed, cancelled or completed state only if that screen's copy already prints the word.

Proposal note: the deposit box is merged into the ticket as its stub, so on the proposal screen the deposit comes before the partner card (content.md lists the partner card first). Kept after design review; not yet confirmed by the owner. The Upcoming ticket carries no stamp (no settled state to name).

Line-break rule: no line may end or begin on a middot separator. Stack the parts as separate lines (org above date) or bind the separator with non-breaking spaces; dropping the joining middot when parts stack is acceptable.

## 9. Where each eyebrow string went

| Screen | String | Job |
|---|---|---|
| Sign in | "Sign in or get started" | Section header over the field group (label plus rule), below the heading |
| Verify your ID | "Verify your ID" | Top-bar title |
| Home | "We found you a shift" | Coupon label on the status ticket |
| Home | "Free plan" | Ink badge at the top of the plan card |
| Shift proposal | "We found you a shift" | Ticket header strip: an ink band across the top of the ticket (Barlow Condensed 600 16, canary text), the way an event ticket carries its title strip |
| Shift proposal | "The shift" · "Daytime" | Coupon label (left) and sun-icon tag (right) on the ticket |
| Shift proposal | "Shift proposal" | Top-bar title |
| Expired | "Your shift" | Top-bar title |


## 10. Rules for every screen

1. Each screen region is one stock: canary for entry and "your day", pink for identity checks, decisions and ended states, white copy for long forms and lists. Never mix two stocks in one cell. Cards are white, canary or pink, with a 2px ink border.
2. Headings in Besley 700 (h2 28/34, balanced), body in Besley 400. Everything that behaves like a form label, button, figure or stamp is Barlow Condensed.
3. One label per field: the label lives inside the form box. No separate headings above a box that repeats its label.
4. Rules, not shadows: 2px ink for boxes and tickets, 1px `rule-soft` between list rows, a 2px ink rule under every section header and over every footer.
5. Corners stay square (0 or 2). The only round things are ticket notches, the native switch and password dots.
6. Stamps mark settled states only (confirmed and held, expired, cancelled, completed), never pending ones: a proposal stays unstamped. Any shift that is proposed, upcoming, confirmed, held, cancelled or ended is a ticket. State is a stamp (vermilion, rotated -8 degrees, uppercase condensed), with a word taken from that screen's copy. Vermilion appears nowhere else but error text and borders.
7. Money-like numbers (Deeds, counts, stats) are Barlow Condensed 700 in ink on white or the stub. The Deeds badge (ink box, canary coin and figure) is the only dark fill besides the primary button.
8. Ground colours flow top to bottom as sheets: a coloured header band holding top bar, heading and lede, then the body stock below. On pink-ground screens the top bar, scroll area and footer share the pink.
9. Primary action lives in a footer above the 34 safe zone; one primary per screen, with a quiet text link for the alternative.
10. Lists are label plus chevron rows at 56 min; grouped data (stats) are ruled boxes sharing borders; no icon-plus-heading-plus-text card grids.
11. Every touch target is 48 tall; tags and badges that are not controls are 28 tall and visibly unlike chips (chips have a border and 48 height).
12. Placeholders use `ink-3`; never grey. Secondary text is `ink-2`, which is tinted from the ink.

## 11. React Native feasibility notes

- Fonts: `@expo-google-fonts/besley` and `@expo-google-fonts/barlow-condensed` via `useFonts` (expo-font). Besley 400 and 700, Barlow Condensed 600 and 700 (500 optional). Maximum two families.
- SVG: `react-native-svg` for the single icon set (24 grid, 2px stroke, square caps, miter joins; back, chevron, check, bell, calendar, sun, coin, verified, info, alert). The set can also be inlined with `Path` components; no icon font. Status bar glyphs are system-drawn.
- Shadows and elevation: none required (`elevation: 0`).
- Gradients: none. No blur, blend modes, filters, clip-paths or textures anywhere.
- Layout is flexbox only. Notches are plain Views; the perforation uses the dashed full-border trick (a clipped wrapper). `transform: rotate` on Views (stamp, torn stub) is supported by core RN. Text transform (`textTransform: 'uppercase'`) and `letterSpacing` are supported.
- Hit slop: 48 tall controls are real view sizes, not hitSlop; badges and tags need none.
- Dates: keep `components/DateField.js` and restyle its field as the date field above (label inside, calendar icon right).
- Dark mode is out of scope (app is light only); note that vermilion and canary would need dark-scheme counterparts before dark mode.
