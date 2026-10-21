# Scheme: Cool (slug: cool)

**Thesis.** Fresh ocean and sky: clear water on a beach clean-up morning, calm and lively at once.
**Mood.** Fresh, clear, optimistic, outdoors.
**Hue family.** Aqua / sky-teal field, deep navy-teal ink, cobalt "you", with a sunny yellow and a coral as small warm counter-notes.
**Must not look like.** The control B (pink / indigo / yellow); a corporate bank or insurance blue; a medical app; Moss (greens); a monochrome all-blue screen. B's two-ink contrast is kept: a loud aqua field against a very dark ink, with cobalt, yellow and coral discs on top.

Built from `base.html`: only the 37 hex values in the SCHEME COLOURS block differ (26 diff lines, 13 changed token lines).

## 1. Token table (ratios copied from check.txt)

| Token | Hex | Where used | Contrast (from check.txt) |
|---|---|---|---|
| ink | #06283A | All text, primary button fill, outlines, icons, status bar | 15.30 on paper/surface; 13.67 on tint; 7.06 on field and selected; 11.81 on field-tint; 13.74 on person-1-tint/accent-tint; 10.60 on accent and person-1; 13.60 on success-tint; 13.20 on danger-tint; 6.05 on person-2; 5.64 on person-3; 7.50 on lens-others |
| ink-2 | #2B5568 | Secondary text | 8.07 on paper/surface; 7.21 on tint; 6.23 on field-tint; 7.24 on person-1-tint/accent-tint |
| ink-3 | #4A7284 | Placeholder | 5.21 on surface; 4.65 on tint |
| on-ink | #FFFFFF | Text on ink (button label, ink tags and card) | 15.30 on ink |
| on-ink-2 | #CDEBF3 | Fine print on the ink deposit card | 12.22 on ink |
| on-ink-line | #3D7F96 | Dashed divider inside the ink card | decorative (not in check) |
| paper | #FFFFFF | The ground | ink 15.30 |
| surface | #FFFFFF | Fields, chips, tags, back button, icon wells | ink 15.30; edge border 3.74 |
| tint | #E9F4F8 | Cards, list rows, stats | ink 13.67; edge border 3.34 |
| edge | #4F8CA3 | Field and chip borders | 3.74 on surface; 3.34 on tint |
| field | #00C2D6 | The loud colour: full-bleed header, Home status card | ink 7.06 |
| field-tint | #B5ECEF | Plan card, safety notice | ink 11.81; ink-2 6.23 |
| selected | #00C2D6 | Selected chip, switch on | ink 7.06 |
| unread | #E4503E | Unread dot | 3.81 on surface (UI) |
| ring | #FFFFFF | Ring around discs and dots | n/a |
| empty-ring | #0A8F9E | Dashed ring on the expired screen | 3.86 on paper (UI) |
| you | #1E3CCB | Signed-in user's disc | on-you 8.19 |
| on-you | #FFFFFF | Person icon on your disc | 8.19 |
| person-1 | #FFD23F | Jordan (partner) disc and avatar | ink 10.60 |
| person-1-tint | #FFF3C2 | Partner card | ink 13.74; ink-2 7.24 |
| person-2 | #FF7B6B | Sam (buddy) disc, "With Sam" dot | ink 6.05 |
| person-3 | #A58BFF | Next person (not drawn) | ink 5.64 |
| lens-1 | #3E7F08 | You + person-1 (shift hero, Home card, sign-in mark) | on-lens 4.95 |
| lens-2 | #A02A7E | You + person-2 (buddy pair) | on-lens 6.72 |
| lens-3 | #8A4DEB | You + person-3 | on-lens 4.84 |
| lens-others | #FF9F43 | Two people without you | ink 7.50 |
| on-lens | #FFFFFF | Text and glyphs on lens-1/2/3 | 4.95 / 6.72 / 4.84 |
| accent | #FFD23F | Deeds badge, Daytime / Free plan tags, notice icon, "5" numeral | ink 10.60; on ink 10.60 |
| accent-tint | #FFF3C2 | Prototype-stage notice | ink 13.74; ink-2 7.24 |
| success | #0B5A3A | "Photo captured" border and check disc | 7.35 on success-tint; on-success 8.27 |
| success-tint | #E3F6EC | Photo captured card | ink 13.60 |
| on-success | #FFFFFF | Check on success disc | 8.27 |
| danger | #B3001B | Error text, border, icon | 7.16 on paper; 6.18 on danger-tint |
| danger-tint | #FFE9EC | Error field fill | ink 13.20 |
| off-bg | #DFEBEF | Disabled button fill | off-fg 4.52 |
| off-fg | #4A6E7E | Disabled button text | 4.52 |
| scrollbar | #5E9AAE | Thin scroll indicator | 3.13 on paper (informational) |

## 2. Person pool and lens table

| Role | Hex | Initial / icon colour | Ratio |
|---|---|---|---|
| you | #1E3CCB | white person icon | 8.19 |
| person-1 (Jordan) | #FFD23F | ink "J" | 10.60 |
| person-2 (Sam) | #FF7B6B | ink "S" | 6.05 |
| person-3 | #A58BFF | ink initial | 5.64 |

| Lens | Pair | Hex | Text | Ratio | How it reads as a mix |
|---|---|---|---|---|---|
| lens-1 | you + person-1 | #3E7F08 | white | 4.95 | Blue over yellow gives a leaf-olive green (hue 93), the classic riso overlap |
| lens-2 | you + person-2 | #A02A7E | white | 6.72 | Blue over coral-red gives a plum magenta (hue 317) |
| lens-3 | you + person-3 | #8A4DEB | white | 4.84 | Blue over lilac gives a brighter violet (hue 263) |
| lens-others | two others | #FF9F43 | ink | 7.50 | Yellow over coral gives orange |

**No person equals the field.** The field is aqua and nobody in the pool is aqua, so no disc ever needs the ring rule; every disc may sit on the field (ring kept anyway for groups).

**Colour-blind result:** 0 FLAG, 8 WARN (B itself had 5 FLAG). Remaining WARNs and the cue that covers them:
- person-1 yellow vs person-2 coral (deut 15.5): ink initials J and S differ; you carries the person icon.
- person-3 lilac vs field (deut 13.9): person-3 is not drawn today; ring and initial carry identity.
- lens vs its own disc (lens-1/2/3 vs you, lens-2 vs person-2 pair, lens-3 vs person-3, lens-2 vs lens-3, success vs lens-1): a lens always holds real text (date, clock icon) and sits between two discs that carry icon or initial, so meaning never rides on lens hue alone. Success also carries a check icon and the word "Photo captured".
- Success (#0B5A3A, dark spruce) is deliberately darker than lens-1 so the two are separated by lightness as well as hue; it is also not the field.

## 3. Rationale and risks

**Why these hues.** Volunteering outdoors, clean water, a beach morning: a bright aqua field feels clear and welcoming rather than corporate, and the very dark navy-teal ink keeps B's heavy poster contrast (ink on field 7.06, better than B's 4.83). Cobalt "you" is never a field colour, is dark enough for a white icon (8.19), is safe for colour-blind users (blue stays blue in every simulation), and has no clash with danger red. Warm yellow and coral keep the screen from going all-blue and give the overprint real mixes (green, plum, violet, orange).

**Risks.**
- Aqua is a cooler, less saturated loud colour than hot pink, so the field is calmer than B's. It is deepened to #00C2D6 (ink 7.06) so it still owns the largest region; hierarchy (field > ink > accent > tints) holds. #00BFD8 was tried and rejected: it gives a person-3 vs field colour-blind FLAG.
- Aqua field against cobalt and teal-ish ink is a cool-heavy palette; yellow accent is small by design and carries the warm contrast. tint (#E9F4F8, almost neutral) and field-tint (#B5ECEF, clearly aqua) are now distinct; still avoid placing them side by side.
- lens-1 is an olive-leaning green; some will find it muddy next to the clean aqua. A brighter green fails white text at 4.5.
- Coral for the unread dot and person-2 is near, but not the same as, danger red; danger is only ever text/border with an icon and message.
- The lens-3 / lens-2 / you separations are WARN-level only (15 to 25 normal vision).

## 4. Ready-to-paste export

```js
// mobile/theme/colors.js
export const colors = {
  ink: '#06283A', ink2: '#2B5568', ink3: '#4A7284',
  onInk: '#FFFFFF', onInk2: '#CDEBF3', onInkLine: '#3D7F96',
  paper: '#FFFFFF', surface: '#FFFFFF', tint: '#E9F4F8', edge: '#4F8CA3',
  field: '#00C2D6', fieldTint: '#B5ECEF',
  selected: '#00C2D6', unread: '#E4503E', ring: '#FFFFFF', emptyRing: '#0A8F9E',
  you: '#1E3CCB', onYou: '#FFFFFF',
  person1: '#FFD23F', person1Tint: '#FFF3C2', person2: '#FF7B6B', person3: '#A58BFF',
  lens1: '#3E7F08', lens2: '#A02A7E', lens3: '#8A4DEB', lensOthers: '#FF9F43', onLens: '#FFFFFF',
  accent: '#FFD23F', accentTint: '#FFF3C2',
  success: '#0B5A3A', successTint: '#E3F6EC', onSuccess: '#FFFFFF',
  danger: '#B3001B', dangerTint: '#FFE9EC',
  offBg: '#DFEBEF', offFg: '#4A6E7E',
  scrollbar: '#5E9AAE',
};
```

Mapping from B's original names to these roles:

| B original | Role token(s) |
|---|---|
| ink (indigo) | ink |
| pink | field, selected, unread, empty-ring; person-2 for Sam's disc |
| pink-tint | field-tint |
| blue | you |
| yellow | person-1, accent |
| yellow-tint | person-1-tint, accent-tint |
| mint | person-3 |
| green | lens-1 (overlap); success is now its own token |
| violet | lens-2 |
| teal | lens-3 |
| orange | lens-others |
| white | paper, surface, ring, on-ink, on-you, on-lens, on-success |
| tint / edge | tint / edge |
| danger / danger-tint | danger / dangerTint |
| off-bg / off-fg | offBg / offFg |
| #E6F7EE (success fill) | success-tint |
