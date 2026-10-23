# Theming

The app's colours come from a swappable palette system. Screens never name a colour; they use role tokens
(`colors.field`, `colors.ink`, `colors.lens1`, ...) from `mobile/theme/colors.js`, and one palette decides what
each role looks like. The visual direction is "Overprint" (design candidate B in `design-candidates/`).

## Swapping the app's colours

- Edit the one line in `mobile/theme/colors.js`: `export const DEFAULT_PALETTE = 'calmTonalShade';`
- Or start Metro with an override, without editing code:
  `EXPO_PUBLIC_PALETTE=mossShadeTonal npx expo start --port 8090`
  Expo reads this variable when bundling; do a full reload of the app, and restart Metro (with `--clear`) if the
  old colours stick. An unknown name falls back to the default (with a warning in development).

## Installed palettes

All live in `mobile/theme/palettes/` and share the same keys.

| Name | Source |
|---|---|
| `calmTonalShade` (default) | `design-candidates/B-round2/calm-tonal-shade/` |
| `calmTonal` | `design-candidates/B-round2/calm-tonal/` |
| `calm` | `design-candidates/B-schemes/calm/` |
| `mossShadeTonal` | `design-candidates/B-round2/moss-shade-tonal/` |
| `mossShade` | `design-candidates/B-round2/moss-shade/` |
| `moss` | `design-candidates/B-schemes/moss/` |
| `mossLinen` | `design-candidates/B-schemes/moss-linen/` |
| `cool` | `design-candidates/B-schemes/cool/` |
| `warm` | `design-candidates/B-schemes/warm/` |

Each scheme folder has a `scheme.md` (the rationale and contrast ratios) and a `check.txt` (the checker output).

## Adding a palette

1. Copy a file in `mobile/theme/palettes/` to a new name and change the values. Keep every key, in the same order,
   including the two native chrome roles at the end.
2. Register it in `mobile/theme/palettes/index.js`.
3. Add its expected colour-blind WARN count to `EXPECTED_WARNS` in `mobile/theme/palettes.test.mjs`.
4. Run the tests (below). They check the key set, hex format, WCAG contrast for every text and boundary pair the
   screens use, and colour-blind separation of people and overlaps.

## Role tokens

| Token | Used for |
|---|---|
| `ink`, `ink2`, `ink3` | Primary text, button fill, outlines and icons; secondary text; placeholder text |
| `onInk`, `onInk2`, `onInkLine` | Text on ink; fine print on an ink card; dashed divider on an ink card |
| `paper` | The ground (screen background) |
| `surface` | Fields, chips, tags, the back button, icon wells |
| `tint` | Default cards, list rows, stats |
| `edge` | Borders on fields, chips and unselected controls |
| `field` | Full-bleed header fields and the Home status card |
| `fieldTint` | Plan card, safety notice |
| `selected` | Selected chip, switch on, focus ring |
| `unread` | Unread dot |
| `ring` | Ring around overlapping discs and dots |
| `emptyRing` | Dashed ring on the empty/expired screen |
| `you`, `onYou` | The signed-in user's disc, and the icon on it |
| `person1`, `person2`, `person3` | The colours other people get |
| `person1Tint` | The partner card fill |
| `lens1`, `lens2`, `lens3` | Overlap of you and person 1, 2, 3 |
| `lensOthers` | Overlap of two people who are not you |
| `onLens` | Text and glyphs on `lens1` to `lens3` |
| `accent`, `accentTint` | Badges, small tags, notice icon, large numerals; the notice fill |
| `success`, `successTint`, `onSuccess` | Photo-captured card and its check disc |
| `danger`, `dangerTint` | Errors; error field fill |
| `offBg`, `offFg` | Disabled button fill and text |
| `scrollbar` | Scroll indicator |
| `shadow` | The footer bar's shadow colour (opacity is set in the style) |
| `statusBar` | `'dark'` or `'light'`: the status bar style over `field` and `paper` (the only non-hex token) |

### Derived pressed tokens

`mobile/theme/palettes/derive.js` adds pressed-state fills computed from each palette, so they follow any swap:
`inkPressed`, `surfacePressed`, `tintPressed`, `fieldPressed`, `accentPressed`. They are on `colors` but are not
part of the palette files.

## People and overlaps

`mobile/theme/people.js` picks person and overlap colours from palette tokens:

- `personKeyFor(userId, meId)` returns `'you'` for the signed-in user, otherwise one of `person1` to `person3`
  from a stable hash of the user id (the same id gets the same colour on every device).
- `personColorFor`, `onPersonColor`, `lensFor(keyA, keyB)` and `onLensFor(keyA, keyB)` return the disc colour, the
  colour of the initial or icon on it, the lens colour for a pair, and the text colour on that lens.

Person colours are derived on the client, not stored. A hash can give two other people the same colour, so discs
also carry an initial. Storing a chosen colour per user would need a backend change.

## Rule: no colour literals outside the palettes

No hex, `rgb()`/`rgba()`/`hsl()` or named colour (other than `'transparent'`) may appear in app code outside
`mobile/theme/palettes/`. A lint test enforces it. While the redesign is in progress, files not yet migrated are
listed in `PENDING_MIGRATION` at the top of `mobile/theme/palettes.test.mjs`; their hits are reported, not failed,
and the list shrinks to empty as screens move to role tokens. `colors.js` also still carries a temporary block of
old colour names (`LEGACY_COLOR_KEYS`) for the same reason.

## Native chrome in app.json

`app.json` cannot import JavaScript, so when you change the default palette, update these by hand to match it:

- `expo.backgroundColor` = the palette's `paper`
- `expo.android.adaptiveIcon.backgroundColor` = the palette's `field`

The test fails if they drift. Splash-screen colour is not set there: configuring it needs the `expo-splash-screen`
package, which this app does not install. The status bar style is not in `app.json` either; it comes from
`colors.statusBar` in JavaScript.

## Tests

From `mobile/`:

```
node --test theme/palettes.test.mjs
node --test theme/palettes.test.mjs onboarding/resume.test.mjs screens/dates.test.mjs
```
