# Moss Linen (slug: moss-linen)

**This is a deliberate exception to B's "no cream/beige ground" rule.** The ground is the app's current warm linen. Verdict in section 3: it still reads as B, because the field, the discs and the overlap carry the identity, not the ground.

**Thesis:** the Moss scheme laid on today's familiar linen, to test continuity with the current look.
**Mood:** Moss's liveliness with today's familiar warmth underneath.
**Hue family:** kelly green field, peacock-teal "you", marigold, peony, lilac, on warm linen.
**Must not look like:** the current plotline look (muted moss on beige with serif type; this keeps B's vivid field, Gabarito type and discs), or a "rustic farmhouse" brand. Also not the Moss scheme itself: the two differ in ground only.

Reviewed by eye on all five frames and the 2b/3b/4b extras.

## 1. Token table (ratios copied from check.txt)

Tokens marked * differ from Moss; every other token is identical to Moss.

| Token | Hex | Where used | Pairs |
|---|---|---|---|
| ink | #0A2E1B | text, primary button, outlines, icons, status bar | on paper 12.01, surface 14.79, tint 13.42, field 6.16, field-tint 11.17, person-1-tint 12.22, accent-tint 12.22, accent 9.56, selected 6.16, success-tint 12.15, danger-tint 11.81 |
| ink-2 | #35604A | secondary text | paper 5.83, surface 7.18, tint 6.52, field-tint 5.42, person-1-tint 5.94, accent-tint 5.94 |
| ink-3* | #456A57 | placeholder | surface 6.08, tint 5.52 |
| on-ink | #FFFFFF | text on ink | 14.79 |
| on-ink-2 | #CFEBD8 | fine print on the ink card | 11.64 |
| on-ink-line | #4A8F69 | dashed divider in the ink card | decorative |
| paper* | #EDE7DA | the ground (app linen, colors.js bg) | ink 12.01, ink-2 5.83, danger 5.34, empty-ring 3.38, scrollbar 3.26 |
| surface* | #FFFFFF | fields, chips, tags, back button, icon wells (white, a touch brighter than the app's #FBF9F3 so wells stay visible on the new cards) | ink 14.79, ink-2 7.18, ink-3 6.08, danger 6.57, edge 4.41, unread 4.16 |
| tint* | #F8F4E4 | cards, list rows, stats (lighter, warmer cream than the ground; 1.12:1 on linen, 1.10:1 vs white wells) | ink 13.42, ink-2 6.52, ink-3 5.52, edge 4.00 |
| edge* | #548266 | field and chip borders | surface 4.41, tint 4.00 |
| field | #2FBF62 | full-bleed header, Home status card | ink 6.16 |
| field-tint* | #C3EBB3 | plan card, safety notice | ink 11.17, ink-2 5.42 |
| selected | #2FBF62 | selected chip, switch on | ink 6.16 |
| unread | #1F8F3A | unread dot | on surface 4.16 |
| ring* | #FFFFFF | ring around discs and dots (follows surface) | |
| empty-ring | #1F8F3A | dashed ring on the expired screen | on paper 3.38 |
| you | #075A73 | the signed-in user's disc | on-you 7.72 |
| on-you | #FFFFFF | person icon on your disc | 7.72 |
| person-1 | #FFC83A | Jordan | ink 9.56 |
| person-1-tint* | #FBE8BA | partner card | ink 12.22, ink-2 5.94 |
| person-2 | #F27FB5 | Sam | ink 5.97 |
| person-3 | #C0A8F5 | next person | ink 7.16 |
| lens-1 | #5A8208 | you + person-1 | on-lens 4.53 |
| lens-2 | #8F2A4C | you + person-2 | on-lens 8.07 |
| lens-3 | #4A52D0 | you + person-3 | on-lens 6.16 |
| lens-others | #EE8A2B | two people without you | ink 5.85 |
| on-lens | #FFFFFF | text on lenses | see lens rows |
| accent | #FFC83A | Deeds badge, plan tags, notice icon, the "5" | ink 9.56; on ink 9.56 |
| accent-tint* | #FBE8BA | prototype-stage notice | ink 12.22, ink-2 5.94 |
| success* | #0B7285 | "Photo captured" card, check disc, dashed border (deep cyan-teal, off green, matching Moss's new success) | on-success 5.59; on success-tint 4.59 |
| success-tint* | #D6EDF1 | photo card fill (pale cyan, separates from linen by hue) | ink 12.15 |
| on-success | #FFFFFF | check icon | 5.59 |
| danger | #B42318 | errors | paper 5.34, surface 6.57, danger-tint 5.25 |
| danger-tint* | #F8E1D9 | error field fill | ink 11.81 |
| off-bg* | #D9DECB | disabled button fill | off-fg 5.31 |
| off-fg* | #3F5D49 | disabled button text | 5.31 |
| scrollbar* | #558A68 | scroll indicator | on paper 3.26 |

Why each moved: paper is the app's linen. Card separation: the first pass used a green tint at about 1.02:1 on linen, which dissolved the Upcoming card, buddy row and stats. Cards (tint) are now a lighter, warmer cream (#F8F4E4, 1.12:1 on linen), and surface is pure white so icon wells and fields stay visible on both linen and cards. Field-tint stays greener (#C3EBB3) so the plan card is clearly the stronger card (field > field-tint > tint). ring follows surface. success and success-tint follow Moss's new deep cyan-teal success (#0B7285), with a pale cyan tint that separates from linen by hue. person-1-tint and accent-tint (#FBE8BA) and danger-tint (#F8E1D9) were nudged warmer and deeper to stay distinct from linen. ink-3 (#456A57), edge (#548266), scrollbar (#558A68) and off-fg/off-bg (#3F5D49 / #D9DECB) were darkened a little because the linen ground is darker than Moss's near-white and the original values fell under 4.5 or 3. The field, ink, ink-2, people, lenses, accent, unread and empty-ring are unchanged from Moss.

Tokens that differ from Moss (starred in the table): ink-3, paper, surface, tint, edge, field-tint, ring, person-1-tint, accent-tint, success, success-tint, danger-tint, off-bg, off-fg, scrollbar. (If Moss's final values for any of these shifted after this was written, only ground-related ones should differ.)

## 2. People and lenses

| Who | Hex | Initial / icon colour | Ratio |
|---|---|---|---|
| you | #075A73 | white person icon | 7.72 |
| person-1 (Jordan) | #FFC83A | ink | 9.56 |
| person-2 (Sam) | #F27FB5 | ink | 5.97 |
| person-3 | #C0A8F5 | ink | 7.16 |

| Lens | Pair | Hex | Text | Ratio | Reads as a mix because |
|---|---|---|---|---|---|
| lens-1 | you + person-1 | #5A8208 | white | 4.53 | teal over marigold gives leafy olive (seen on Home, Sign in and Proposal: reads as the overlap) |
| lens-2 | you + person-2 | #8F2A4C | white | 8.07 | teal over pink gives deep berry |
| lens-3 | you + person-3 | #4A52D0 | white | 6.16 | teal over lilac gives indigo |
| lens-others | two others | #EE8A2B | ink | 5.85 | marigold over peony tends to orange |

**Colour-blind result:** 0 FLAG, 9 WARN, identical to Moss (people and lenses are unchanged, and linen is not part of any pair). Weakest: person-1 vs field under protanopia 10.8, lens-2 vs you under protanopia 10.2, lens-3 vs you under tritanopia 11.3, success vs lens-1 under tritanopia 12.0 (check.txt line for that pair). Cues that carry identity: initials in ink on others, the white person icon on you, the surface-coloured ring around discs on the field, and the check icon plus text on the success card.

## 3. Rationale and risks

Green is the app's existing identity and linen is its existing ground, so this is the least disruptive adoption path: existing screens keep their warm paper, and only the field, discs and overlap become vivid. Green on linen works because both are warm-leaning; the kelly field has strong contrast against the ground, so the header and Home card still own the screen.

Risks: (1) The ground is the one place B's original brief said no; the page is calmer and a little more "familiar app" than B, with less crisp white-on-colour pop. (2) Cards separate from linen by only about 1.12:1 in luminance (cream on linen is inherently low-contrast); confirmed visibly clear in the browser, but verify on a dim Android screen. Wells are white on the cream card (about 1.10:1). (3) lens-1 white text is 4.53, close to the floor; do not lighten. (4) Success is now a teal near "you" (#075A73) in hue family, though lighter and paired with a check icon and text; the check disc is not an identity colour. Field, lens-1 and unread remain the green family. (5) Surface is pure white against the app's #FBF9F3 surface, a tiny departure for fields and wells.

Judgement on "still B?": yes. The field is as bold as B's (same hex as Moss), the discs and overlap read as two inks overprinting, and the hierarchy field > ink > accent > tints holds. What changes is temperature: the ground makes it feel like a warmer paper print than a white poster. It does not read as the old plotline look, because the type, the vivid field and the full-colour discs are unchanged.

## 4. Export

```js
// mobile/theme/colors.js
export const colors = {
  ink: '#0A2E1B', ink2: '#35604A', ink3: '#456A57',
  onInk: '#FFFFFF', onInk2: '#CFEBD8', onInkLine: '#4A8F69',
  paper: '#EDE7DA', surface: '#FFFFFF', tint: '#F8F4E4', edge: '#548266',
  field: '#2FBF62', fieldTint: '#C3EBB3',
  selected: '#2FBF62', unread: '#1F8F3A', ring: '#FFFFFF', emptyRing: '#1F8F3A',
  you: '#075A73', onYou: '#FFFFFF',
  person1: '#FFC83A', person1Tint: '#FBE8BA', person2: '#F27FB5', person3: '#C0A8F5',
  lens1: '#5A8208', lens2: '#8F2A4C', lens3: '#4A52D0', lensOthers: '#EE8A2B', onLens: '#FFFFFF',
  accent: '#FFC83A', accentTint: '#FBE8BA',
  success: '#0B7285', successTint: '#D6EDF1', onSuccess: '#FFFFFF',
  danger: '#B42318', dangerTint: '#F8E1D9',
  offBg: '#D9DECB', offFg: '#3F5D49',
  scrollbar: '#558A68',
};
```

| B's original name | Role in this scheme |
|---|---|
| pink | field / selected / unread / empty-ring (person-2 is peony #F27FB5) |
| pink-tint | field-tint |
| blue | you |
| yellow | person-1 and accent |
| yellow-tint | person-1-tint and accent-tint |
| green | lens-1 (success is now separate) |
| violet | lens-2 |
| teal | lens-3 |
| orange | lens-others |
| mint | person-3 (lilac here) |
