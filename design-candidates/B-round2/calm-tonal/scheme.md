# Scheme: Calm, tonal (slug: calm-tonal)

**Thesis.** Round-1 Calm with only the three off-putting colours removed: the slate-blue "you" disc, the mustard person/accent and the olive lens. They become deep, pale and deepest tones of the lavender field, so the overprint reads as lavender deepening. Everything else is round 1 exactly.
**Mood.** Soft, calm, considered, still friendly, with a clearer single lavender voice.
**Hue families.** Heather lavender (field, tints, "you", Jordan, accent, lens-1) and deep aubergine ink, with clay (Sam), sage (next person), rose (lens-2) and teal (lens-3) kept as in round 1, and the dark green success card.
**Must not look like.** The control B, round-1 Calm with its blue/mustard/olive, a pastel baby app, or a grey corporate UI. The ground is pure white. No cyan shade is used in this variant.

## Tokens changed from round 1 (everything else equals round-1 Calm exactly)

| Token | Round 1 | Now | Why |
|---|---|---|---|
| you | #35599A (slate blue) | #6A4DBE | deep violet; 22.8 from the aubergine ink (normal vision) and clearly bluer, so not an ink blob; 29.3 from the field |
| person-1 | #EBC45A (mustard) | #E6D6F8 | pale lavender, lighter than the field |
| person-1-tint | #F7EBCB | #EEE6F8 | partner card, a pale lavender slightly deeper than `tint` |
| accent | #EBC45A | #D5C7EE | pale lavender for badge, tags, notice icon and the "5" |
| accent-tint | #F7EBCB | #EAE2F5 | pale lavender notice |
| lens-1 | #617B37 (olive) | #2D1B78 | deep indigo-violet overprint of the new you and person-1 |

Unchanged on purpose, and still reading as the overprint with the new "you": lens-2 #9A4A68 (violet over clay gives a dusty plum-rose, hue 255 + 12 -> 338) and lens-3 #2A8080 (violet over sage gives teal, hue 255 + 102 -> 180). No re-derivation was needed: their white text ratios and distance from "you" still pass (see check.txt).

## Token table (all ratios copied from check.txt)

| Token | Hex | Where used | Pairs |
|---|---|---|---|
| ink | #331A45 | all text, primary button, outlines, icons, status bar | 15.28 on paper/surface, 13.59 on tint, 6.73 on field and selected, 11.94 on field-tint, 12.59 on person-1-tint, 12.15 on accent-tint, 9.63 on accent, 11.16 on person-1, 5.17 on person-2, 11.85 on person-3, 6.79 on lens-others, 13.00 on success-tint, 12.84 on danger-tint |
| ink-2 | #5A3E72 | secondary text | 8.87 on paper/surface, 7.89 on tint, 6.93 on field-tint, 7.31 on person-1-tint, 7.05 on accent-tint |
| ink-3 | #6F5683 | placeholder | 6.30 on surface, 5.60 on tint |
| on-ink | #FFFFFF | text on ink | 15.28 on ink |
| on-ink-2 | #E6D9F0 | fine print on the ink card | 11.31 on ink |
| on-ink-line | #7C5E94 | dashed divider in the ink card | decorative |
| paper | #FFFFFF | ground | n/a |
| surface | #FFFFFF | fields, chips, tags, back button, icon wells | n/a |
| tint | #F4F0F9 | cards, list rows, stats | see ink rows |
| edge | #867099 | field and chip borders | 4.38 on surface, 3.90 on tint (UI 3:1) |
| field | #B6A3DB | full-bleed header, Home status card | ink 6.73 |
| field-tint | #E8E0F5 | plan card, safety notice | ink 11.94, ink-2 6.93 |
| selected | #B6A3DB | selected chip, switch on, focus ring | ink 6.73 |
| unread | #7A5CB5 | bell dot | 5.22 on surface (UI 3:1) |
| ring | #FFFFFF | ring around discs and dots | n/a |
| empty-ring | #8266BA | dashed ring on the expired screen | 4.61 on paper (UI 3:1) |
| you | #6A4DBE | your disc | white icon 6.14 |
| on-you | #FFFFFF | person icon on your disc | 6.14 |
| person-1 | #E6D6F8 | Jordan disc, avatar | ink 11.16 |
| person-1-tint | #EEE6F8 | partner card | ink 12.59, ink-2 7.31 |
| person-2 | #D4806B | Sam disc, "With Sam" dot | ink 5.17 |
| person-3 | #D6E8CE | next person (not drawn) | ink 11.85 |
| lens-1 | #2D1B78 | you + person-1 (Home card, Sign in, proposal hero) | white 13.64 |
| lens-2 | #9A4A68 | you + person-2 (buddy pair) | white 5.91 |
| lens-3 | #2A8080 | you + person-3 | white 4.67 |
| lens-others | #D9A26C | two people without you | ink 6.79 |
| on-lens | #FFFFFF | text and glyphs on lens-1/2/3 | 13.64 / 5.91 / 4.67 |
| accent | #D5C7EE | Deeds badge, Daytime / Free tags, notice icon, "5" numeral | ink 9.63; on ink 9.63 (large) |
| accent-tint | #EAE2F5 | prototype-stage notice | ink 12.15, ink-2 7.05 |
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
| you | #6A4DBE | white person icon | 6.14 |
| person-1 (Jordan) | #E6D6F8 | ink J | 11.16 |
| person-2 (Sam) | #D4806B | ink S | 5.17 |
| person-3 | #D6E8CE | ink initial | 11.85 |

| Lens | Pair | Hex | Text | Ratio | Reads as a mix because |
|---|---|---|---|---|---|
| lens-1 | you + person-1 | #2D1B78 | white | 13.64 | violet over pale lavender gives a deeper, richer indigo-violet (hue 255 + 268 -> 252), darker than either disc |
| lens-2 | you + person-2 | #9A4A68 | white | 5.91 | violet over clay gives a dusty plum-rose (255 + 12 -> 338) |
| lens-3 | you + person-3 | #2A8080 | white | 4.67 | violet over pale sage gives teal (255 + 102 -> 180) |
| lens-others | two others | #D9A26C | ink | 6.79 | clay over sage gives a warm amber (unchanged) |

Lens-1 is 17.6 from "you", 68.8 from Jordan and 49.5 from the field (normal vision), so it is clearly its own shape. It is 8.6 from the aubergine ink, a saturated indigo rather than a brown-purple.

The ring rule is as in round 1: no person equals the field, so the white ring is drawn as in B but never has to rescue a disc.

## Hue families per frame: before and after

Before is round-1 Calm. After is this variant. Families: lav = lavender/violet, ink = aubergine and neutrals, slate = slate blue, must = mustard, olive, clay, rose (lens-2 plum-rose), green (success card), red (danger, only where an error shows).

| Frame | Before (round-1 Calm) | Count | After (calm-tonal) | Count |
|---|---|---|---|---|
| 1 Sign in | lav, ink, slate, must, olive | 5 | lav, ink | 2 |
| 2 Verify your ID | lav, ink, must (accent/notice), green, red | 5 | lav, ink, green, red | 4 |
| 3 Home | lav, ink, slate, must (badge, Jordan), clay, olive, rose | 7 | lav, ink, clay, rose | 4 |
| 4 Shift proposal | lav, ink, slate, must, olive | 5 | lav, ink | 2 |
| 5 Proposal expired | lav, ink, slate, must | 4 | lav, ink | 2 |
| 2b Verify, full scroll | as 2 | 5 | as 2 | 4 |
| 3b Home, full scroll | as 3 | 7 | as 3 | 4 |
| 4b Proposal, full scroll | as 4 | 5 | as 4 | 2 |

Frames 1, 4, 5 and 4b drop to lavender plus ink only. Home keeps clay and rose (Sam and the buddy lens); Verify keeps green (success card) and red (error), as round 1.

## Colour-blind result (copied from check.txt)

0 contrast FAIL, 0 FLAG, 10 WARN (round-1 Calm had 11). "You" is at least 38.8 from Jordan and Sam and 27.2 from the field under every simulation. Remaining WARNs, all at 10 or above after simulation:

- person-1 vs person-3: 14.8 worst (trit). Jordan pale lavender, the next person pale sage; both carry an initial. Person-3 is not drawn.
- person-1 vs field: 12.4 worst (trit). Jordan is lighter than the field, carries the J initial and, on the field, the white ring.
- person-3 vs field: 19.4 worst, unchanged from round 1.
- lens vs its disc: lens-1 vs you 17.6, lens-2 vs you 18.8, lens-2 vs person-2 19.3, lens-3 vs you 18.3 (worst). The lens always holds the shift as text and sits on the overlap.
- lens-2 vs lens-3: 11.4 worst (unchanged from round 1; lens-3 is not drawn). lens-1 vs lens-2: 19.9 worst.
- success vs lens-1: 18.4 worst (trit). The success card always has a check icon, the words "Photo captured" and a dashed border, and never sits beside the lens.

## Rationale and risks

The cofounder loved the lavender field and disliked the slate blue "you", mustard Jordan/accent and the olive lens. Those are replaced by deep, pale and deepest tones of the lavender, so frames 1, 4 and 5 are now one lavender voice plus aubergine ink. Sam's clay, the sage and the rose and teal lenses stay, so Home still reads as a person-colour screen, not a one-hue one, and the green success card is unchanged.

Risks:
- "You" (#6A4DBE, L* about 41) is the darkest coloured thing on the hero but is clearly lighter and bluer than the ink (22.8 apart), so it should not read as an ink blob. It is less deep than the old slate.
- Lens-1 (#2D1B78) is the deepest tone of the set and 8.6 from the ink; if it looks too dark on the Home status card, lighten it a step and re-check it against "you" (17.6 now).
- Jordan's pale lavender disc has little edge on a white or tint surface; the initial and the ring carry it, and it is 13.8 from the field.
- The accent is now pale, so the Deeds badge and tags rely on their ink text rather than colour weight.

## Export (mobile/theme/colors.js)

```js
// mobile/theme/colors.js
export const colors = {
  ink: '#331A45', ink2: '#5A3E72', ink3: '#6F5683', onInk: '#FFFFFF', onInk2: '#E6D9F0', onInkLine: '#7C5E94',
  paper: '#FFFFFF', surface: '#FFFFFF', tint: '#F4F0F9', edge: '#867099',
  field: '#B6A3DB', fieldTint: '#E8E0F5', selected: '#B6A3DB',
  unread: '#7A5CB5', ring: '#FFFFFF', emptyRing: '#8266BA',
  you: '#6A4DBE', onYou: '#FFFFFF',
  person1: '#E6D6F8', person1Tint: '#EEE6F8', person2: '#D4806B', person3: '#D6E8CE',
  lens1: '#2D1B78', lens2: '#9A4A68', lens3: '#2A8080', lensOthers: '#D9A26C', onLens: '#FFFFFF',
  accent: '#D5C7EE', accentTint: '#EAE2F5',
  success: '#14573C', successTint: '#E2F0E8', onSuccess: '#FFFFFF',
  danger: '#A3213F', dangerTint: '#F9E7EA',
  offBg: '#EAE5F0', offFg: '#6A587C', scrollbar: '#A898BC',
};
```

| B original name | Role token (colors.js key) |
|---|---|
| pink (field uses) | field, selected, unread*, emptyRing* (*deeper violets here) |
| pink (Sam's disc) | person2 (clay here) |
| pink-tint | fieldTint |
| blue | you (deep violet here) |
| yellow (Jordan disc/avatar) | person1 (pale lavender here) |
| yellow (Deeds badge, tags, notice icon, numeral) | accent (pale lavender here) |
| yellow-tint | person1Tint (partner card), accentTint (notice) |
| mint | person3 (sage here) |
| green (overlap lens) | lens1 (deep indigo-violet here) |
| green (photo captured) | success (a separate, darker green) |
| violet | lens2 (rose here) |
| teal | lens3 |
| orange | lensOthers |
| tint | tint |
| edge | edge |
| paper | paper (ground), surface (fields, chips, tags) |
| ink, ink-2, ink-3 | ink, ink2, ink3 |
| on-ink-2 | onInk2 |
| danger, danger-tint | danger, dangerTint |
| off-bg, off-fg | offBg, offFg |
