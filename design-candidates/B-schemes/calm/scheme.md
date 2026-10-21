# Scheme: Calm (slug: calm)

**Thesis.** Still two inks overprinting, but dusty and lighter: a riso print on soft stock in faded inks.
**Mood.** Soft, calm, considered, still friendly.
**Hue family.** Heather lavender field, deep aubergine ink; mustard, clay and pale sage people; dusty mid slate-blue for "you"; olive, plum and teal lenses.
**Must not look like.** The control B (hot pink and indigo), a muted copy of B's pink/indigo, Moss (green), Warm (orange/coral), Cool (aqua/sky), a pastel baby app or a grey corporate UI. The ground is pure white.

Hierarchy is kept, not flattened: field (heather) > ink (aubergine, 15:1 on white) > accent (mustard) > tints. The quiet comes from lower chroma and a lighter field, not from lower contrast.

## Token table (all ratios copied from check.txt)

| Token | Hex | Where used | Pairs |
|---|---|---|---|
| ink | #331A45 | all text, primary button, outlines, icons, status bar | 15.28 on paper/surface, 13.59 on tint, 6.73 on field and selected, 11.94 on field-tint, 12.88 on person-1-tint/accent-tint, 9.15 on accent and person-1, 5.17 on person-2, 11.85 on person-3, 6.79 on lens-others, 13.00 on success-tint, 12.84 on danger-tint |
| ink-2 | #5A3E72 | secondary text | 8.87 on paper/surface, 7.89 on tint, 6.93 on field-tint, 7.48 on person-1-tint/accent-tint |
| ink-3 | #6F5683 | placeholder | 6.30 on surface, 5.60 on tint |
| on-ink | #FFFFFF | text on ink | 15.28 on ink |
| on-ink-2 | #E6D9F0 | fine print on the ink card | 11.31 on ink |
| on-ink-line | #7C5E94 | dashed divider in the ink card | decorative |
| paper | #FFFFFF | ground | n/a |
| surface | #FFFFFF | fields, chips, tags, back button, icon wells | n/a |
| tint | #F4F0F9 | cards, list rows, stats | see ink rows |
| edge | #867099 | field and chip borders | 4.38 on surface, 3.90 on tint (UI 3:1) |
| field | #B6A3DB | full-bleed header (sign-in, verify, proposal), Home status card | ink 6.73 |
| field-tint | #E8E0F5 | plan card, safety notice | ink 11.94, ink-2 6.93 |
| selected | #B6A3DB | selected chip, switch on | ink 6.73 |
| unread | #7A5CB5 | unread dot | 5.22 on surface (UI 3:1). Deeper than the field on purpose: the pale field would fail 3:1 on white |
| ring | #FFFFFF | ring around discs and dots | n/a |
| empty-ring | #8266BA | dashed ring on the expired screen | 4.61 on paper (UI 3:1). Same reason as unread |
| you | #35599A | your disc | white icon 6.89 |
| on-you | #FFFFFF | person icon on your disc | 6.89 |
| person-1 | #EBC45A | Jordan disc, avatar | ink 9.15 |
| person-1-tint | #F7EBCB | partner card | ink 12.88, ink-2 7.48 |
| person-2 | #D4806B | Sam disc, "With Sam" dot | ink 5.17 |
| person-3 | #D6E8CE | next person (not drawn) | ink 11.85 |
| lens-1 | #617B37 | you + person-1 (Home card, Sign in, proposal hero) | white 4.78 |
| lens-2 | #9A4A68 | you + person-2 (buddy pair) | white 5.91 |
| lens-3 | #2A8080 | you + person-3 | white 4.67 |
| lens-others | #D9A26C | two people without you | ink 6.79 |
| on-lens | #FFFFFF | text and glyphs on lens-1/2/3 | 4.78 / 5.91 / 4.67 |
| accent | #EBC45A | Deeds badge, Daytime / Free tags, notice icon, "5" numeral | ink 9.15; on ink 9.15 (large) |
| accent-tint | #F7EBCB | prototype-stage notice | ink 12.88, ink-2 7.48 |
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
| you | #35599A | white person icon | 6.89 |
| person-1 (Jordan) | #EBC45A | ink J | 9.15 |
| person-2 (Sam) | #D4806B | ink S | 5.17 |
| person-3 | #D6E8CE | ink initial | 11.85 |

| Lens | Pair | Hex | Text | Ratio | Reads as a mix because |
|---|---|---|---|---|---|
| lens-1 | you + person-1 | #617B37 | white | 4.78 | slate-blue over mustard gives olive green (hue 219 + 44 -> 83) |
| lens-2 | you + person-2 | #9A4A68 | white | 5.91 | slate-blue over clay gives a dusty plum-rose (219 + 12 -> 338) |
| lens-3 | you + person-3 | #2A8080 | white | 4.67 | slate-blue over pale sage gives teal (219 + 102 -> 180) |
| lens-others | two others | #D9A26C | ink | 6.79 | mustard over clay gives a warm amber |

The ring rule: no person equals the field, so nobody needs the white ring to survive on it. The ring is still drawn as in B.

**Colour-blind result.** 0 contrast FAIL, 0 FLAG, 11 WARN (B itself had 5 FLAG). The pool is separated by lightness as well as hue: pale sage, mid mustard, mid-dark clay, mid-dark slate-blue. Remaining WARNs (all above CIEDE2000 10 after simulation): person-1 vs person-2 (deut 16.4), person-1 vs person-3 (19.4), person-3 on the field (trit 19.4), lens vs its own disc (lowest lens-3 vs you, trit 11.7; lens-2 vs you prot 14.1), lens-2 vs lens-3 (deut 11.4), success vs lens-1 (17.3). "You" is 41 or more from every other person under all simulations (28 on the field). Non-colour cues that carry identity: initials on every other person, the person icon on you, the ring, and the lens always holding the shift as text. Success also carries a check icon and dashed border, so meaning never rides on hue alone.

## Rationale and risks

Heather lavender is a calm, friendly hue with no strong charity or brand association, and a lighter field leaves room for the darker ink to do the work. Aubergine ink is a warmer, softer cousin of black. Mustard, clay and sage are earthy, faded riso-ink tones; dusty mid slate-blue for "you" is the one cool note, never used as a field. Lenses follow real ink behaviour (blue over yellow is green), so the overlap still reads.

Risks:
- The field is lighter than B's pink (ink on it is 6.73 vs 4.83), so the "loud region" is quieter by design. Anyone who wants punch may find it too gentle.
- "You" is a mid slate-blue (#35599A), darker than the field but clearly lighter than the ink, so the disc stays distinct from the aubergine ink under colour-blind simulation and does not pull the eye from the field.
- Lens-1 (4.78) and lens-3 (4.67) are close to the 4.5 floor, so they cannot be lightened further.
- Pale sage person-3 on white has little edge of its own; it relies on the ring and its initial.
- unread and empty-ring are deeper violets than the field, so they are related to it but not identical.

## Export (mobile/theme/colors.js)

```js
// mobile/theme/colors.js
export const colors = {
  ink: '#331A45', ink2: '#5A3E72', ink3: '#6F5683', onInk: '#FFFFFF', onInk2: '#E6D9F0', onInkLine: '#7C5E94',
  paper: '#FFFFFF', surface: '#FFFFFF', tint: '#F4F0F9', edge: '#867099',
  field: '#B6A3DB', fieldTint: '#E8E0F5', selected: '#B6A3DB',
  unread: '#7A5CB5', ring: '#FFFFFF', emptyRing: '#8266BA',
  you: '#35599A', onYou: '#FFFFFF',
  person1: '#EBC45A', person1Tint: '#F7EBCB', person2: '#D4806B', person3: '#D6E8CE',
  lens1: '#617B37', lens2: '#9A4A68', lens3: '#2A8080', lensOthers: '#D9A26C', onLens: '#FFFFFF',
  accent: '#EBC45A', accentTint: '#F7EBCB',
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
| yellow-tint | person1Tint (partner card), accentTint (notice) |
| mint | person3 |
| green (overlap lens) | lens1 |
| green (photo captured) | success (a separate, darker green here) |
| violet | lens2 |
| teal | lens3 |
| orange | lensOthers |
| tint | tint |
| edge | edge |
| paper | paper (ground), surface (fields, chips, tags) |
| ink, ink-2, ink-3 | ink, ink2, ink3 |
| on-ink-2 | onInk2 |
| danger, danger-tint | danger, dangerTint |
| off-bg, off-fg | offBg, offFg |
