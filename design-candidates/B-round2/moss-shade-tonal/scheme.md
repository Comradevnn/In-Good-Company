# Moss, shade and tonal greens (slug: moss-shade-tonal)

**Thesis:** round-1 Moss with the pale cyan-blue shade on the cards and one change of cast: the blue "you", the marigold person and the olive lens become tones of the Moss green. Everything else keeps Moss's character.

**Mood:** the same lively community garden as Moss, quieter: one green does the work, cyan-white cards sit on a near-white ground.
**Hue families:** green (field, forest ink, you, Jordan, the lens, accent), the cyan shade (cards, the photo-captured card), and peony and lilac for the other people, beet and indigo for their lenses (unchanged).
**Must not look like:** round-1 Moss (blue disc, marigold, olive lens); a monochrome green app (peony and lilac people are kept on purpose); an ink blob (the lens is a green, not the ink).

Visual check: frames 1, 3, 4 and 4b were reviewed in a browser at 390 wide. Contrast and colour-blind figures below are copied from `check.txt`.

## 0. Tokens changed from round 1 (Moss)

Only these seven values differ from `B-schemes/moss/index.html`; every other value is identical.

| Token | Round 1 | Now | Why |
|---|---|---|---|
| tint | #E9F5E4 | #E9F4F8 | the pale cyan-blue shade the cofounder likes |
| you | #075A73 | #127718 | deep leaf green instead of peacock blue |
| person-1 | #FFC83A | #A8E6B8 | mid-pale green instead of marigold |
| person-1-tint | #FFEFC9 | #E3F6E8 | pale green partner card |
| accent | #FFC83A | #B9ECC7 | pale green for Deeds badge, tags, notice icon, "5" |
| accent-tint | #FFEFC9 | #E3F6E8 | pale green prototype notice |
| lens-1 | #5A8208 | #0B4A16 | deep green overprint of you + person-1 instead of olive |

lens-2 (#8F2A4C beet) and lens-3 (#4A52D0 indigo) are unchanged: against the new `you` they still read as a dark green under peony (beet) and under lilac (indigo), and the checker shows no FLAG for them.

## 1. Token table (ratios copied from check.txt)

| Token | Hex | Where used | Pairs |
|---|---|---|---|
| ink | #0A2E1B | text, primary button, outlines, icons, status bar | on paper 14.41, surface 14.79, tint 13.22, field 6.16, field-tint 12.27, person-1-tint 13.11, accent-tint 13.11, accent 11.19, selected 6.16, success-tint 12.75, danger-tint 12.57 |
| ink-2 | #35604A | secondary text | on paper 7.00, surface 7.18, tint 6.42, field-tint 5.96, person-1-tint 6.37, accent-tint 6.37 |
| ink-3 | #4F7461 | placeholder | on surface 5.25, tint 4.69 |
| on-ink | #FFFFFF | text on ink | on ink 14.79 |
| on-ink-2 | #CFEBD8 | fine print on the ink card | on ink 11.64 |
| on-ink-line | #4A8F69 | dashed divider inside the ink card | decorative |
| paper | #FAFDF7 | the ground | see ink, danger rows |
| surface | #FFFFFF | fields, chips, tags, back button, icon wells | see ink rows |
| tint | #E9F4F8 | cards, list rows, stats (the cyan shade) | ink 13.22, ink-2 6.42, ink-3 4.69 |
| edge | #5E8C70 | field and chip borders | on surface 3.85, on tint 3.44 |
| field | #2FBF62 | full-bleed header, Home status card | ink on field 6.16; you 24.0 apart (normal vision) |
| field-tint | #D2F3CB | plan card, safety notice | ink 12.27, ink-2 5.96 |
| selected | #2FBF62 | selected chip, switch on, focus ring | ink on selected 6.16 |
| unread | #1F8F3A | unread dot | on surface 4.16 |
| ring | #FFFFFF | ring around discs and dots | |
| empty-ring | #1F8F3A | dashed ring on the expired screen | on paper 4.05 |
| you | #127718 | the signed-in user's disc | on-you 5.71 |
| on-you | #FFFFFF | person icon on your disc | 5.71 |
| person-1 | #A8E6B8 | Jordan: discs, avatar | ink on it 10.34 |
| person-1-tint | #E3F6E8 | partner card | ink 13.11, ink-2 6.37 |
| person-2 | #F27FB5 | Sam: buddy disc pair | ink on it 5.97 |
| person-3 | #C0A8F5 | the next person (not drawn) | ink on it 7.16 |
| lens-1 | #0B4A16 | you + person-1 | on-lens 10.47 |
| lens-2 | #8F2A4C | you + person-2 | on-lens 8.07 |
| lens-3 | #4A52D0 | you + person-3 | on-lens 6.16 |
| lens-others | #EE8A2B | two people without you | ink on it 5.85 |
| on-lens | #FFFFFF | text and glyphs on lens-1/2/3 | see lens rows |
| accent | #B9ECC7 | Deeds badge, Daytime / Free plan tags, notice icon, the "5" numeral | ink 11.19; on ink 11.19 |
| accent-tint | #E3F6E8 | prototype-stage notice | ink 13.11, ink-2 6.37 |
| success | #0B7285 | "Photo captured" card, check disc, dashed border (cyan-teal) | on-success 5.59; on success-tint 4.82 |
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
| you | #127718 | white person icon | 5.71 |
| person-1 (Jordan, pale green) | #A8E6B8 | ink | 10.34 |
| person-2 (Sam, peony) | #F27FB5 | ink | 5.97 |
| person-3 (lilac) | #C0A8F5 | ink | 7.16 |

| Lens | Pair | Hex | Text | Ratio | Reads as a mix because |
|---|---|---|---|---|---|
| lens-1 | you + person-1 | #0B4A16 | white | 10.47 | deep leaf green over pale green overprints to a much darker, richer forest green (same hue family, darker than either disc) |
| lens-2 | you + person-2 | #8F2A4C | white | 8.07 | unchanged: leaf green over peony pink darkens to a deep beet |
| lens-3 | you + person-3 | #4A52D0 | white | 6.16 | unchanged: leaf green over lilac gives a deeper periwinkle-indigo |
| lens-others | two others | #EE8A2B | ink | 5.85 | unchanged: two other people's discs, with no green in the pair, overprint to a warm orange |

Only one pair on any screen. The disc on the field takes the white 3px ring. lens-1 is #0B4A16: 42.0 from the field, 55.1 from person-1, and 15.2 from `you` (normal vision, the closest pair). The Home status card (field) and the shift-proposal hero both show you (mid-dark leaf), person-1 (pale) and the lens (deep) as three clearly separate lightness steps on the green; the lens is a green, so it does not read as an ink blob.

## 3. Hue families per frame, before and after

Families: green (field, ink, edge, ink-2, you, person-1, lens-1, accent, tints), blue-teal (cyan shade, peacock "you", success card), yellow (marigold), olive (round-1 lens-1), pink / berry (peony, beet), lilac / indigo. Neutrals (white, paper, grey) not counted; danger red listed separately where an error shows.

BEFORE = round-1 Moss with `tint` = #E9F4F8. AFTER = this scheme.

| Frame | Before | Count | After | Count |
|---|---|---|---|---|
| 1 Sign in | green, blue-teal (you), yellow (Jordan), olive (lens) | 4 | green | 1 |
| 2 Verify your ID | green, yellow (notice, accent), blue-teal (photo card) + red | 3 + red | green, blue-teal (photo card) + red | 2 + red |
| 3 Home | green, yellow (Deeds badge), blue-teal (you, cards), olive, pink / berry (Sam, beet) | 5 | green, blue-teal (cards), pink / berry (Sam, beet) | 3 |
| 4 Shift proposal | green, blue-teal (you, shift card), yellow (Jordan, partner card, tags), olive | 4 | green, blue-teal (shift card) | 2 |
| 5 Proposal expired | green (dashed ring), blue-teal (you), yellow (Jordan) | 3 | green | 1 |
| 2b Verify, full scroll | same as 2 | 3 + red | same as 2 | 2 + red |
| 3b Home, full scroll | same as 3 | 5 | same as 3 | 3 |
| 4b Shift proposal, full scroll | same as 4 | 4 | same as 4 | 2 |

## 4. Colour-blind result

Copied from check.txt: **0 FLAG, 8 WARN** (every value after simulation is >= 12.1).

Weakest pairs: lens-1 vs lens-2 under deuteranopia 12.1 (dark green vs beet go to similar dark olive-greys); lens-2 vs you under deuteranopia 15.1; person-2 vs person-3 under protanopia 11.9 (unchanged from round 1); person-1 vs field 14.7 to 16.5 on all simulations (pale green on leaf green); person-1 vs person-2 under deuteranopia 18.1. Also WARN: lens-1 vs you 14.1 (tritanopia), lens-3 vs you 16.5, success vs lens-1 16.8.

Cues that cover them: only one lens is shown on a screen, and it carries its text or clock glyph; others carry their initial in ink and you carry the white person icon; any disc on the field takes the white 3px ring, so Jordan's pale disc is outlined where it sits on the green; the success card has a check icon and text.

## 5. Rationale and risks

The cofounder loves the Moss field, so the field, the forest ink, peony and lilac people and their lenses, the cyan success card and every tint except the card shade stay exactly as in round 1. The off-putting parts were the blue "you", the marigold person and accent, and the olive lens; those become deep, pale and darker tones of the Moss green. The cards take the cyan-blue shade (#E9F4F8) that was liked. The Moss status card keeps its green.

Reduction: frames 1 and 5 now show one hue family (from 4 and 3); the Shift proposal shows two (from 4); Home shows three (from 5). Peony and lilac people were kept on purpose, so Home (Sam) still carries the pink / berry family.

Risks: (1) many greens (field, you, Jordan, lens, accent, selected, unread): lightness separates them (deep lens, mid-dark you, pale Jordan, pale accent) and the field stays the loudest thing; on dense screens the pale accent tag and Jordan's pale disc are similar. (2) Jordan's pale disc on the field is only 16.5 apart (WARN) and relies on the white ring. (3) `you` (#127718) is a fairly bright leaf green and only 24.0 from the field; going darker would collapse it into lens-1 (the checker FLAGs that). (4) lens-1 is dark (10.47 for white text); it is a green at hue 130, not the ink (#0A2E1B) but both are very dark, so judge them side by side on the Shift proposal.

## 6. Export

```js
// mobile/theme/colors.js
export const colors = {
  ink: '#0A2E1B', ink2: '#35604A', ink3: '#4F7461',
  onInk: '#FFFFFF', onInk2: '#CFEBD8', onInkLine: '#4A8F69',
  paper: '#FAFDF7', surface: '#FFFFFF', tint: '#E9F4F8', edge: '#5E8C70',
  field: '#2FBF62', fieldTint: '#D2F3CB',
  selected: '#2FBF62', unread: '#1F8F3A', ring: '#FFFFFF', emptyRing: '#1F8F3A',
  you: '#127718', onYou: '#FFFFFF',
  person1: '#A8E6B8', person1Tint: '#E3F6E8', person2: '#F27FB5', person3: '#C0A8F5',
  lens1: '#0B4A16', lens2: '#8F2A4C', lens3: '#4A52D0', lensOthers: '#EE8A2B', onLens: '#FFFFFF',
  accent: '#B9ECC7', accentTint: '#E3F6E8',
  success: '#0B7285', successTint: '#DDF2F6', onSuccess: '#FFFFFF',
  danger: '#B42318', dangerTint: '#FDE8E4',
  offBg: '#DDEADB', offFg: '#4F6B59',
  scrollbar: '#659B77',
};
```

| B's original name | Role in this scheme |
|---|---|
| pink | field / selected / unread / empty-ring (person-2 is peony #F27FB5) |
| pink-tint | field-tint |
| blue | you (deep leaf green) |
| yellow | person-1 (pale green) and accent (paler green) |
| yellow-tint | person-1-tint and accent-tint (pale green) |
| green | lens-1 (deep green; success is a separate cyan-teal) |
| violet | lens-2 |
| teal | lens-3 |
| orange | lens-others |
| mint | person-3 (lilac here) |
