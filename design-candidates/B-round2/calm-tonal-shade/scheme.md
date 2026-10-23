# Scheme: Calm, tonal, with the shade (slug: calm-tonal-shade)

**Thesis.** Round-1 Calm, kept as it was (heather lavender field, aubergine ink, clay and sage people, rose and teal lenses, green photo card), with only the three things the cofounder disliked replaced by tones of the lavender: the slate-blue "you" becomes a deep violet, the mustard person and accent become pale lavenders, and the olive lens becomes a deep violet overprint. Default cards take the pale cyan-blue shade.
**Mood.** Soft, calm, considered, still friendly, with a cool quiet card shade beside the lavender.
**Hue families.** Heather lavender field and its tones (you, Jordan, accent, lens-1), aubergine ink, white ground, pale cyan-blue shade (#E9F4F8) for cards, plus Calm's own clay and sage people, rose and teal lenses and green photo card.
**Must not look like.** The control B (hot pink and indigo), Moss (green), Warm, Cool, a pastel baby app or a grey corporate UI. No navy or peacock-blue "you", no mustard or marigold, no olive lens. The ground is pure white.

## Tokens changed from round 1 (`B-schemes/calm/index.html`)

Every other value equals round 1 exactly (block diffed).

| Token | Round 1 | Now | Why |
|---|---|---|---|
| tint | #F4F0F9 | #E9F4F8 | the pale cyan-blue shade for default cards, rows, stats (ink-2, ink-3 and edge needed no retune: 7.93, 5.63, 3.92) |
| you | #35599A | #6F49B1 | deep violet in the field's hue family replaces the slate blue; white icon 6.43 |
| person-1 | #EBC45A | #DED2F7 | pale lavender replaces mustard; ink initial 10.67 |
| person-1-tint | #F7EBCB | #E9F4F8 | partner card uses the cyan shade |
| lens-1 | #617B37 | #381A72 | deep violet overprint of the new you and person-1 replaces the olive |
| accent | #EBC45A | #D3C5EC | pale lavender replaces mustard (Deeds badge, tags, notice icon, "5") |
| accent-tint | #F7EBCB | #EFE9F9 | very pale lavender for the prototype notice |

Unchanged on purpose: ink family, paper, surface, edge, field, field-tint, selected, unread (#7A5CB5), ring, empty-ring (#8266BA), person-2 (clay), person-3 (sage), lens-2 (rose #9A4A68), lens-3 (teal #2A8080), lens-others, on-lens, success, success-tint, on-success (the green photo card), danger, disabled, scrollbar, on-ink tokens.

lens-2 and lens-3 were not re-derived. Deep violet over clay still gives a dusty plum-rose (hue 262 + 12 -> 338, same rose as round 1), and deep violet over pale sage still gives a teal (262 + 102 -> 180), so both still read as the mix and keep their round-1 hex.

## Token table (all ratios copied from check.txt)

| Token | Hex | Where used | Pairs |
|---|---|---|---|
| ink | #331A45 | all text, primary button, outlines, icons, status bar | 15.28 on paper/surface, 13.65 on tint and person-1-tint, 6.73 on field and selected, 11.94 on field-tint, 12.87 on accent-tint, 9.43 on accent, 10.67 on person-1, 5.17 on person-2, 11.85 on person-3, 6.79 on lens-others, 13.00 on success-tint, 12.84 on danger-tint |
| ink-2 | #5A3E72 | secondary text | 8.87 on paper/surface, 7.93 on tint and person-1-tint, 6.93 on field-tint, 7.48 on accent-tint |
| ink-3 | #6F5683 | placeholder | 6.30 on surface, 5.63 on tint |
| on-ink | #FFFFFF | text on ink | 15.28 on ink |
| on-ink-2 | #E6D9F0 | fine print on the ink card | 11.31 on ink |
| on-ink-line | #7C5E94 | dashed divider in the ink card | decorative |
| paper | #FFFFFF | ground | n/a |
| surface | #FFFFFF | fields, chips, tags, back button, icon wells | n/a |
| tint | #E9F4F8 | default cards (shift card, Upcoming, buddy row), list rows, stats | see ink and ink-2 rows |
| edge | #867099 | field and chip borders | 4.38 on surface, 3.92 on tint (UI 3:1) |
| field | #B6A3DB | full-bleed header (sign-in, verify, proposal), Home status card | ink 6.73 |
| field-tint | #E8E0F5 | plan card, safety notice | ink 11.94, ink-2 6.93 |
| selected | #B6A3DB | selected chip, switch on, focus ring | ink 6.73 |
| unread | #7A5CB5 | unread dot | 5.22 on surface (UI 3:1) |
| ring | #FFFFFF | ring around discs and dots | n/a |
| empty-ring | #8266BA | dashed ring on the expired screen | 4.61 on paper (UI 3:1) |
| you | #6F49B1 | your disc | white icon 6.43 |
| on-you | #FFFFFF | person icon on your disc | 6.43 |
| person-1 | #DED2F7 | Jordan disc, avatar | ink 10.67 |
| person-1-tint | #E9F4F8 | partner card | ink 13.65, ink-2 7.93 |
| person-2 | #D4806B | Sam disc, "With Sam" dot | ink 5.17 |
| person-3 | #D6E8CE | next person (not drawn) | ink 11.85 |
| lens-1 | #381A72 | you + person-1 (Home card, Sign in, proposal hero) | white 13.47 |
| lens-2 | #9A4A68 | you + person-2 (buddy pair) | white 5.91 |
| lens-3 | #2A8080 | you + person-3 (not drawn) | white 4.67 |
| lens-others | #D9A26C | two people without you (not drawn) | ink 6.79 |
| on-lens | #FFFFFF | text and glyphs on lens-1/2/3 | 13.47 / 5.91 / 4.67 |
| accent | #D3C5EC | Deeds badge, Daytime / Free tags, notice icon, "5" numeral | ink 9.43; on ink 9.43 (large) |
| accent-tint | #EFE9F9 | prototype-stage notice | ink 12.87, ink-2 7.48 |
| success | #14573C | "Photo captured" card and check disc | on-success 8.54; 7.27 on success-tint (border) |
| success-tint | #E2F0E8 | photo card fill | ink 13.00 |
| on-success | #FFFFFF | check icon | 8.54 |
| danger | #A3213F | errors | 7.38 on paper/surface, 6.20 on danger-tint |
| danger-tint | #F9E7EA | error field fill | ink 12.84 |
| off-bg | #EAE5F0 | disabled button fill | off-fg 5.14 |
| off-fg | #6A587C | disabled button text | 5.14 |
| scrollbar | #A898BC | scroll indicator | 2.66 on paper (informational) |

## Person pool and lenses

| Who | Hex | Initial / icon | Ratio |
|---|---|---|---|
| you | #6F49B1 | white person icon | 6.43 |
| person-1 (Jordan) | #DED2F7 | ink J | 10.67 |
| person-2 (Sam) | #D4806B | ink S | 5.17 |
| person-3 | #D6E8CE | ink initial | 11.85 |

| Lens | Pair | Hex | Text | Ratio | Reads as a mix because |
|---|---|---|---|---|---|
| lens-1 | you + person-1 | #381A72 | white | 13.47 | deep violet over pale lavender gives a deeper, richer indigo-violet than either disc (hue 262 + 259 -> 260) |
| lens-2 | you + person-2 | #9A4A68 | white | 5.91 | deep violet over clay gives a dusty plum-rose (262 + 12 -> 338), unchanged from round 1 |
| lens-3 | you + person-3 | #2A8080 | white | 4.67 | deep violet over pale sage gives teal (262 + 102 -> 180), unchanged from round 1 |
| lens-others | two others | #D9A26C | ink | 6.79 | a warm amber for two other people, unchanged from round 1 (kept by design) |

The ring rule: no person equals the field, so nobody needs the white ring to survive on it. The ring is still drawn as in B. The pale Jordan disc is the lightest shape on the Home card and proposal hero and reads clearly against the heather field (ink J on it, 10.67).

## Hue families per frame, before and after

"Before" is round-1 Calm with the cyan tint applied, so only the colour removals are counted. Families: L lavender (field, its tints, unread, empty ring), B slate blue, Y mustard, O olive, C clay, S sage (not drawn), R rose, T teal (not drawn), G green (photo card), Cy cyan shade, N ink and neutrals. Danger red is listed separately.

| Frame | Before (round-1 Calm + cyan tint) | n | After (calm-tonal-shade) | n |
|---|---|---|---|---|
| 1 Sign in | L, B, Y, O, N | 5 | L, N | 2 |
| 2 Verify your ID | L, Y, G, N + red | 4 + red | L, G, N + red | 3 + red |
| 3 Home | L, B, Y, O, Cy, C, R, N | 8 | L, Cy, C, R, N | 5 |
| 4 Shift proposal | L, B, Y, O, Cy, N | 6 | L, Cy, N | 3 |
| 5 Proposal expired | L, B, Y, N | 4 | L, N | 2 |
| 2b Verify, full scroll | L, Y, G, N + red | 4 + red | L, G, N + red | 3 + red |
| 3b Home, full scroll | L, B, Y, O, Cy, C, R, N | 8 | L, Cy, C, R, N | 5 |
| 4b Shift proposal, full scroll | L, B, Y, O, Cy, N | 6 | L, Cy, N | 3 |

Notes: Home still shows clay (Sam's dot and disc) and rose (the buddy lens) because they are kept from round 1; the status card, the proposal hero, the Deeds badge, the tags, the notice and the expired screen no longer carry blue, mustard or olive. Frame 4 and 4b are down to the field hue, the cyan shade and ink.

## Colour-blind result (from check.txt)

0 contrast FAIL, 0 FLAG, 9 WARN (round-1 Calm had 11 WARN, B had 5 FLAG). Remaining WARNs, all at least 11.4 after protanopia, deuteranopia and tritanopia simulation (CIEDE2000, FLAG is under 10):
- person-1 vs person-3 (lowest trit 11.9) and person-1 vs field (lowest trit 11.4): Jordan is a pale lavender next to pale sage and a mid heather field. Cues: the ink initial J on every Jordan disc, the ring, and the lens, which holds the shift as white text (lens-1 is 47.2 or more from the field and 62.8 or more from person-1).
- person-3 vs field (trit 19.4): person-3 is not drawn; it has an initial and ring.
- lens vs its own disc (lens-1 vs you lowest 16.2, lens-2 vs you 17.7, lens-2 vs person-2 trit 19.3, lens-3 vs you deut 17.3) and lens-2 vs lens-3 (prot 12.6, deut 11.4): the lens is an overlap shape that holds the shift as text, and one pair shows at a time.

"You" is 28.1 or more from the field and 33.1 or more from every other person under all simulations. The green success card is 37.9 or more from lens-1 and 45.9 or more from the field.

## Rationale and risks

- Cofounder feedback: the navy slate "you", the mustard person and accent and the olive lens are gone; the loved lavender field, aubergine ink and the green photo card are unchanged; the pale cyan-blue shade is the default card.
- The cyan shade is very light and low chroma, so it reads as the quiet neutral beside the lavender and did not need nudging. The partner card uses the same shade, so the shift and partner cards match.
- "You" is a deep violet (#6F49B1), a purple rather than a blue, much lighter and more saturated than the aubergine ink (so it stays distinct beside ink text and icons) and darker than the field.
- Jordan is a pale lavender: visible on the heather field and on white, but light on a white page, so it always carries its ink initial and ring.
- Lens-1 (13.47) is the deepest violet in the set; it is distinct from field, you and person-1, and does not resemble the aubergine ink (hue and chroma differ).
- Clay Sam and the rose and teal lenses are unchanged, so Home still has more hues than the other frames; that is by design.
- unread (#7A5CB5) and empty-ring (#8266BA) stay as round 1; they are slightly lighter than "you", so the bell dot and ring are related to it but not identical.

## Export (mobile/theme/colors.js)

```js
// mobile/theme/colors.js
export const colors = {
  ink: '#331A45', ink2: '#5A3E72', ink3: '#6F5683', onInk: '#FFFFFF', onInk2: '#E6D9F0', onInkLine: '#7C5E94',
  paper: '#FFFFFF', surface: '#FFFFFF', tint: '#E9F4F8', edge: '#867099',
  field: '#B6A3DB', fieldTint: '#E8E0F5', selected: '#B6A3DB',
  unread: '#7A5CB5', ring: '#FFFFFF', emptyRing: '#8266BA',
  you: '#6F49B1', onYou: '#FFFFFF',
  person1: '#DED2F7', person1Tint: '#E9F4F8', person2: '#D4806B', person3: '#D6E8CE',
  lens1: '#381A72', lens2: '#9A4A68', lens3: '#2A8080', lensOthers: '#D9A26C', onLens: '#FFFFFF',
  accent: '#D3C5EC', accentTint: '#EFE9F9',
  success: '#14573C', successTint: '#E2F0E8', onSuccess: '#FFFFFF',
  danger: '#A3213F', dangerTint: '#F9E7EA',
  offBg: '#EAE5F0', offFg: '#6A587C', scrollbar: '#A898BC',
};
```

| B original name | Role token (colors.js key) |
|---|---|
| pink (field uses) | field, selected, unread*, emptyRing* (*deeper violets here) |
| pink (Sam's disc) | person2 |
| pink-tint | fieldTint |
| blue | you |
| yellow (Jordan disc/avatar) | person1 |
| yellow (Deeds badge, tags, notice icon, numeral) | accent |
| yellow-tint | person1Tint (partner card, the cyan shade), accentTint (notice) |
| mint | person3 |
| green (overlap lens) | lens1 |
| green (photo captured) | success (a separate, darker green here) |
| violet | lens2 |
| teal | lens3 |
| orange | lensOthers |
| tint | tint (the pale cyan-blue shade) |
| edge | edge |
| paper | paper (ground), surface (fields, chips, tags) |
| ink, ink-2, ink-3 | ink, ink2, ink3 |
| on-ink-2 | onInk2 |
| danger, danger-tint | danger, dangerTint |
| off-bg, off-fg | offBg, offFg |
