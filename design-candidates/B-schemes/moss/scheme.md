# Moss (slug: moss)

**Thesis:** the app's existing green identity pushed to Overprint's boldness, so the redesign reads as the same app grown up.

**Mood:** lively, outdoorsy, a community garden on a sunny Saturday.
**Hue family:** greens (field, lens-1, ink) with marigold, peony pink, lilac and a deep peacock-teal "you".
**Must not look like:** the control B (hot pink / blue / yellow); the dusty plotline look (muted moss on beige); a generic "eco" brand (pale sage and leaf); the Cool scheme (ocean teal and sky). The field is a saturated kelly/leaf green, the ground is near-white, and warm marigold carries the small jobs.

Visual check: all frames, including the success card after it moved off green to cyan-teal, were reviewed in a browser at 390 wide. selected stays equal to the field, as in B. Contrast and colour-blind figures below are copied from `check.txt`.

## 1. Token table (ratios copied from check.txt)

| Token | Hex | Where used | Pairs |
|---|---|---|---|
| ink | #0A2E1B | text, primary button, outlines, icons, status bar | on paper 14.41, surface 14.79, tint 13.14, field 6.16, field-tint 12.27, person-1-tint 12.99, accent-tint 12.99, accent 9.56, selected 6.16, success-tint 12.75, danger-tint 12.57 |
| ink-2 | #35604A | secondary text | on paper 7.00, surface 7.18, tint 6.38, field-tint 5.96, person-1-tint 6.31, accent-tint 6.31 |
| ink-3 | #4F7461 | placeholder | on surface 5.25, tint 4.66 |
| on-ink | #FFFFFF | text on ink | on ink 14.79 |
| on-ink-2 | #CFEBD8 | fine print on the ink card | on ink 11.64 |
| on-ink-line | #4A8F69 | dashed divider inside the ink card | decorative |
| paper | #FAFDF7 | the ground (faintly green-tinted white) | see ink, danger rows |
| surface | #FFFFFF | fields, chips, tags, back button, icon wells | see ink rows |
| tint | #E9F5E4 | cards, list rows, stats | see ink rows |
| edge | #5E8C70 | field and chip borders | on surface 3.85, on tint 3.41 |
| field | #2FBF62 | full-bleed header, Home status card | ink on field 6.16; you 49.9 apart (normal vision) |
| field-tint | #D2F3CB | plan card, safety notice | ink 12.27, ink-2 5.96 |
| selected | #2FBF62 | selected chip, switch on | ink on selected 6.16 |
| unread | #1F8F3A | unread dot (darker than field so it holds 3:1) | on surface 4.16 |
| ring | #FFFFFF | ring around discs and dots | |
| empty-ring | #1F8F3A | dashed ring on the expired screen | on paper 4.05 |
| you | #075A73 | the signed-in user's disc | on-you 7.72 |
| on-you | #FFFFFF | person icon on your disc | 7.72 |
| person-1 | #FFC83A | Jordan: discs, avatar | ink on it 9.56 |
| person-1-tint | #FFEFC9 | partner card | ink 12.99, ink-2 6.31 |
| person-2 | #F27FB5 | Sam: buddy disc pair | ink on it 5.97 |
| person-3 | #C0A8F5 | the next person (not drawn) | ink on it 7.16 |
| lens-1 | #5A8208 | you + person-1 | on-lens 4.53 |
| lens-2 | #8F2A4C | you + person-2 | on-lens 8.07 |
| lens-3 | #4A52D0 | you + person-3 | on-lens 6.16 |
| lens-others | #EE8A2B | two people without you | ink on it 5.85 |
| on-lens | #FFFFFF | text and glyphs on lens-1/2/3 | see lens rows |
| accent | #FFC83A | Deeds badge, Daytime / Free plan tags, notice icon, the "5" numeral | ink 9.56; on ink 9.56 |
| accent-tint | #FFEFC9 | prototype-stage notice | ink 12.99, ink-2 6.31 |
| success | #0B7285 | "Photo captured" card, check disc, dashed border (deep cyan-teal, off the greens) | on-success 5.59; on success-tint 4.82 |
| success-tint | #DDF2F6 | photo card fill | ink 12.75 |
| on-success | #FFFFFF | check icon | 5.59 |
| danger | #B42318 | errors | on paper 6.40, surface 6.57, danger-tint 5.58 |
| danger-tint | #FDE8E4 | error field fill | ink 12.57 |
| off-bg | #DDEADB | disabled button fill | off-fg on it 4.71 |
| off-fg | #4F6B59 | disabled button text | 4.71 |
| scrollbar | #659B77 | scroll indicator | on paper 3.14 |

## 2. People and lenses

| Who | Hex | Initial / icon colour | Ratio |
|---|---|---|---|
| you | #075A73 | white person icon | 7.72 |
| person-1 (Jordan, marigold) | #FFC83A | ink | 9.56 |
| person-2 (Sam, peony) | #F27FB5 | ink | 5.97 |
| person-3 (lilac) | #C0A8F5 | ink | 7.16 |

| Lens | Pair | Hex | Text | Ratio | Reads as a mix because |
|---|---|---|---|---|---|
| lens-1 | you + person-1 | #5A8208 | white | 4.53 | peacock-teal over marigold gives a leafy olive green (hue 80, between teal 194 and marigold 43) |
| lens-2 | you + person-2 | #8F2A4C | white | 8.07 | teal over pink gives a deep beet/berry (dark, hue 340; the teal darkens the pink the way riso blue darkens pink) |
| lens-3 | you + person-3 | #4A52D0 | white | 6.16 | teal over lilac gives a deeper periwinkle-indigo (hue 236) |
| lens-others | two others | #EE8A2B | ink | 5.85 | marigold over peony tends to orange |

Only one pair on any screen, so the field and the lens are never confused: lens-1 is dark olive (white text, L low) on a light kelly field.

**Colour-blind result:** 0 FLAG, 9 WARN (all >= 10 after simulation). Weakest pairs: person-1 vs field under protanopia 10.8 (marigold on green, the classic red/green weakness), and the lens-1 vs success pair under tritanopia 12.0. Cues that cover them: others always carry their initial in ink, you carry the white person icon, discs on the field take the white 3px ring, and the success card has a check icon and text so meaning does not ride on hue.

## 3. Rationale and risks

Green is the volunteering app's existing identity (the moss in colors.js), so moving the field to a vivid leaf green keeps the family and gains the energy of B. The ground stays near-white (a whisper of green), not beige. Marigold replaces yellow for the small jobs (it is the ochre of the current palette brightened). "You" is a deep peacock teal, never a field colour, so your disc is safe on every screen and distinct from the green. Success is a deep cyan-teal (#0B7285), so it is not a fourth green: it is 40.7 from the field and 38.7 from lens-1 (normal vision). It is in the same teal family as "you" (#075A73) but lighter, and appears only on the photo-captured card, which also has a check icon and text. Peony pink and lilac are small person colours only; no pink field exists.

Risks: (1) lens-1's white text is only 4.53, close to the floor; do not lighten it. (2) Several greens (field, lens-1, unread dot, selected chip/switch) sit in one family: hue and value separate them; on dense screens they can still blur meanings. (3) Marigold on kelly green is the weakest colour-blind pair; always ring it.

## 4. Export

```js
// mobile/theme/colors.js
export const colors = {
  ink: '#0A2E1B', ink2: '#35604A', ink3: '#4F7461',
  onInk: '#FFFFFF', onInk2: '#CFEBD8', onInkLine: '#4A8F69',
  paper: '#FAFDF7', surface: '#FFFFFF', tint: '#E9F5E4', edge: '#5E8C70',
  field: '#2FBF62', fieldTint: '#D2F3CB',
  selected: '#2FBF62', unread: '#1F8F3A', ring: '#FFFFFF', emptyRing: '#1F8F3A',
  you: '#075A73', onYou: '#FFFFFF',
  person1: '#FFC83A', person1Tint: '#FFEFC9', person2: '#F27FB5', person3: '#C0A8F5',
  lens1: '#5A8208', lens2: '#8F2A4C', lens3: '#4A52D0', lensOthers: '#EE8A2B', onLens: '#FFFFFF',
  accent: '#FFC83A', accentTint: '#FFEFC9',
  success: '#0B7285', successTint: '#DDF2F6', onSuccess: '#FFFFFF',
  danger: '#B42318', dangerTint: '#FDE8E4',
  offBg: '#DDEADB', offFg: '#4F6B59',
  scrollbar: '#659B77',
};
```

| B's original name | Role in this scheme |
|---|---|
| pink | field / selected / unread / empty-ring (person-2 is now peony #F27FB5) |
| pink-tint | field-tint |
| blue | you |
| yellow | person-1 and accent |
| yellow-tint | person-1-tint and accent-tint |
| green | lens-1 (success is now a separate cyan-teal, not green) |
| violet | lens-2 |
| teal | lens-3 |
| orange | lens-others |
| mint | person-3 (lilac here) |
