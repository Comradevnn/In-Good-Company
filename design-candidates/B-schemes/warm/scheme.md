# Scheme: Warm (slug: warm)

Candidate B ("Overprint") in one new colour scheme. Only colours change; layout, type and the overlap move are B's.

## 1. Name, thesis, mood

- **Name:** Warm.
- **Thesis:** sunny and appetizing, like a community food-bank day or a street-fair poster: B's two-ink punch in tangerine, marigold and a deep wine-brown.
- **Mood:** warm, generous, sociable, appetizing.
- **Hue family:** orange (field), marigold (accent and partner), a deep wine-espresso ink (hue about 330, never black, never navy), with a deep sea-blue "you" disc (orange's complement), and marigold, periwinkle and mint for the other people.
- **Must not look like:** pink (control B), green (Moss), warm-cream-plus-terracotta, ketchup-and-mustard fast food, or Halloween. Notes on how it avoids each: the field is a clean tangerine (not red, not terracotta); the ground is pure white and the tints are light peach and rose, never beige; the ink is wine-brown, not black, so orange never sits against black; "you" is a deep sea-blue, never purple, so no orange-and-purple pairing appears anywhere.

## 2. Token table

Ratios are copied from `check.txt`. "(none)" means the token is not part of a checked text pair.

| Token | Hex | Where used | Contrast pairs |
|---|---|---|---|
| ink | #3A0F26 | all text, primary button fill, outlines, icons, status bar | on paper 16.45; on surface 16.45; on tint 14.63; on field 6.59; on field-tint 13.15; on person-1-tint 14.64; on accent-tint 14.64; on accent 11.28; on selected 6.59; on success-tint 14.41; on danger-tint 13.92; on person-1 11.28; on person-2 7.38; on person-3 9.76; on lens-others 9.52 |
| ink-2 | #6A3350 | secondary text | on paper 9.54; surface 9.54; tint 8.48; field-tint 7.62; person-1-tint 8.49; accent-tint 8.49 |
| ink-3 | #85505F | placeholder | on surface 6.34; on tint 5.64 |
| on-ink | #FFFFFF | text on ink (button label, ink tags and cards) | 16.45 on ink |
| on-ink-2 | #F6DCE4 | fine print on the ink deposit card | 12.75 on ink |
| on-ink-line | #8A5470 | dashed divider inside the ink card | (decorative, none) |
| paper | #FFFFFF | the ground | (see ink rows) |
| surface | #FFFFFF | fields, chips, tags, back button, icon wells | (see ink rows) |
| tint | #FCEFEA | cards, list rows, stats | (see ink rows) |
| edge | #B06A6F | field and chip borders | on surface 4.09; on tint 3.64 (UI, needs 3) |
| field | #FF8040 | the loud region: hero header on sign-in, verify and proposal; Home status card | ink on field 6.59 |
| field-tint | #FFE0CC | plan card, safety notice | ink 13.15; ink-2 7.62 |
| selected | #FF8040 | selected chip, switch on | ink 6.59 |
| unread | #D9440C | the unread dot | on surface 4.39 (UI, needs 3) |
| ring | #FFFFFF | ring around discs and dots | (none) |
| empty-ring | #D9440C | dashed ring on the expired screen | on paper 4.39 |
| you | #0F5F80 | the signed-in user's disc | on-you 7.07 |
| on-you | #FFFFFF | person icon on your disc | 7.07 on you |
| person-1 | #FFD11F | Jordan (partner): discs, avatar | ink 11.28 |
| person-1-tint | #FFF2BD | partner card | ink 14.64; ink-2 8.49 |
| person-2 | #9AA8FF | Sam (buddy): buddy disc pair, "With Sam" dot | ink 7.38 |
| person-3 | #5FDDB0 | next person (not drawn) | ink 9.76 |
| lens-1 | #6B7A12 | you + person-1 (shift hero, Home, Sign in, Shift proposal) | on-lens 4.75 |
| lens-2 | #4A58E0 | you + person-2 (buddy pair) | on-lens 5.58 |
| lens-3 | #1F8264 | you + person-3 | on-lens 4.73 |
| lens-others | #9ED47A | two people without you | ink 9.52 |
| on-lens | #FFFFFF | text and glyphs on lens-1/2/3 | 4.75 / 5.58 / 4.73 |
| accent | #FFD11F | Deeds badge, Daytime / Free plan tags, notice icon, the "5" on the ink card | ink 11.28; accent on ink 11.28 |
| accent-tint | #FFF2BD | prototype-stage notice | ink 14.64; ink-2 8.49 |
| success | #1B5E20 | "Photo captured" border and check disc | on success-tint 6.89; on-success 7.87 |
| success-tint | #E3F4EA | "Photo captured" card fill | ink 14.41 |
| on-success | #FFFFFF | check icon on the success disc | 8.25 |
| danger | #B0123A | errors | on paper 7.01; on surface 7.01; on danger-tint 5.93 |
| danger-tint | #FFE6EA | error field fill | ink 13.92 |
| off-bg | #F2E6E8 | disabled button fill | off-fg 5.34 |
| off-fg | #7A5360 | disabled button text | 5.34 on off-bg |
| scrollbar | #C9959B | thin scroll indicator | NOTE 2.54 on paper (informational, as in B) |

## 3. Person pool and lens table

| Who | Hex | Initial / icon | Ratio |
|---|---|---|---|
| you | #0F5F80 (deep sea-blue) | white person icon | 7.07 |
| person-1 (Jordan) | #FFD11F (marigold) | ink "J" | 11.28 |
| person-2 (Sam) | #9AA8FF (periwinkle) | ink "S" | 7.38 |
| person-3 | #5FDDB0 (mint) | ink initial | 9.76 |

No person equals the field, so the ring rule is satisfied by design (a person disc can sit anywhere); the white ring is still kept.

| Lens | Pair | Hex | Text | Ratio | How it reads as a mix |
|---|---|---|---|---|---|
| lens-1 | you + person-1 | #6B7A12 | white | 4.75 | sea-blue printed over marigold gives an olive green (hue 69 between 198 and 48), like riso blue over yellow |
| lens-2 | you + person-2 | #4A58E0 | white | 5.58 | sea-blue over periwinkle gives a saturated blue-violet (hue 234 between 198 and 232), brighter than either disc |
| lens-3 | you + person-3 | #1F8264 | white | 4.73 | sea-blue over mint gives a sea-green (hue 162 between 198 and 159) |
| lens-others | two others | #9ED47A | ink | 9.52 | yellow-family ink over a blue-family ink gives a fresh leaf green, kept light so ink text reads |

**Colour-blind result:** 0 FLAG, 8 WARN (B itself has 5 FLAG). The WARNs, and the cue that covers each:
- person-2 vs person-3 (trit 16.9): the ink initial on each disc.
- person-1 vs field (deut 12.3, a disc on the field): the 3px white ring around any disc on a field, and the ink initial.
- lens-2 vs you (norm 16.0, deut 12.7), lens-3 vs you (trit 10.4), lens-1 vs lens-3 (prot 16.4), lens-2 vs lens-3 (trit 14.8), lens-1 vs field (prot 11.8): a lens always holds real text beside two named discs (you carry the person icon, others carry initials), so no meaning rides on lens hue alone.
- success vs lens-1 (prot 12.9, deut 15.3): success is leaf green (hue about 123), lens-1 is olive (about 69) and lens-3 sea-green (about 162), so success is separated from both by hue as well as lightness; and the photo card also has a check icon and the words "Photo captured".

## 4. Rationale and risks

**Why these hues.** A volunteering app that feeds and gathers people should feel like a hot meal and a street fair: tangerine is the colour of generosity and appetite, marigold the colour of a hand-painted sign, and a deep wine-brown ink reads as printed ink on warm paper without the coldness of navy or the bluntness of black. The "you" disc is the one deep cool hue in the system (sea-blue, the complement of the tangerine field), so you always stand apart from the warm field and from everyone else, and a white icon on it passes at 7.07. Because the pool (marigold, periwinkle, mint) is spread across the wheel and none of it is the field, nobody ever disappears into the header.

**Risks.**
- Sea-blue "you" on the tangerine field is a complementary pair and reads vivid and sporty, not Halloween. Keep "you" around #0E5E7E to #11607E.
- lens-1 (sea-blue over marigold) is a deep olive. It reads as an overprint but is the least bright of the mixes; it is held just above 4.5 for white text (4.75), so do not lighten it.
- Marigold (accent, partner) is close in hue to the tangerine field; they are separated by lightness, but side by side on the Home status card the yellow tags and discs need the ring to stay crisp.
- White on the field is 2.4:1, so no white text on tangerine (as in B: ink only).
- Success (#1B5E20, a deep leaf green, hue about 123) and lens-1 (olive) are both green-leaning: they differ in hue and lightness, and success always carries a check icon and label, but lens-1 and success should never be shown as the same meaning.
- Android rendering of the peach tint (#FCEFEA) should be checked once on a device.

## 5. Export for the app

```js
// mobile/theme/colors.js
export const colors = {
  ink: '#3A0F26', ink2: '#6A3350', ink3: '#85505F',
  onInk: '#FFFFFF', onInk2: '#F6DCE4', onInkLine: '#8A5470',
  paper: '#FFFFFF', surface: '#FFFFFF', tint: '#FCEFEA', edge: '#B06A6F',
  field: '#FF8040', fieldTint: '#FFE0CC',
  selected: '#FF8040', unread: '#D9440C', ring: '#FFFFFF', emptyRing: '#D9440C',
  you: '#0F5F80', onYou: '#FFFFFF',
  person1: '#FFD11F', person1Tint: '#FFF2BD', person2: '#9AA8FF', person3: '#5FDDB0',
  lens1: '#6B7A12', lens2: '#4A58E0', lens3: '#1F8264', lensOthers: '#9ED47A', onLens: '#FFFFFF',
  accent: '#FFD11F', accentTint: '#FFF2BD',
  success: '#1B5E20', successTint: '#E3F4EA', onSuccess: '#FFFFFF',
  danger: '#B0123A', dangerTint: '#FFE6EA',
  offBg: '#F2E6E8', offFg: '#7A5360',
  scrollbar: '#C9959B',
};
```

Mapping from B's original token names to these roles:

| B original | Role in this file |
|---|---|
| pink | field (and selected, unread, empty-ring; person-2 is now periwinkle, no longer pink) |
| pink-tint | field-tint |
| blue | you |
| yellow | person-1 (and accent) |
| yellow-tint | person-1-tint (and accent-tint) |
| green | lens-1 (success is now its own token, success) |
| violet | lens-2 |
| teal | lens-3 |
| orange | lens-others |
| mint | person-3 |
| tint | tint |
| edge | edge |
| paper | paper (surface for fields and chips) |
| ink / ink-2 / ink-3 | ink / ink-2 / ink-3 |
| on-ink-2 | on-ink-2 |
| danger / danger-tint | danger / danger-tint |
| off-bg / off-fg | off-bg / off-fg |
