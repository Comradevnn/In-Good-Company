# Design candidates

A short design exploration: three distinct visual directions for a full
revamp of the In Good Company app, each drawn on the same five screens with
the same copy, so the owner can pick one. These are static HTML comps. Nothing
in `mobile/` changed.

## Open it

Open `compare.html` in a browser (double-click it, or `file://` it). It
shows the three candidates in tabs with a comparison table and a
recommendation. Each candidate's comps are also standalone:
`A/index.html`, `B/index.html`, `C/index.html`.

## What's here

| Path | What it is |
|---|---|
| `content.md` | The exact copy and demo data every candidate had to use, unchanged. Copy comes from the current app; people, organizations and addresses are made up. |
| `A/`, `B/`, `C/` | One folder per candidate: `index.html` (five phone frames, 390 × 844) and `direction.md` (the direction contract: tokens, type scale, component anatomy, states, signature move, rules for every screen, React Native notes). |
| `compare.html` | Side-by-side comparison, feasibility and critique summary, and the recommendation. |
| `../PRODUCT.md` | Product context for the Impeccable design skill. High level and marked as inferred; confirm it with `/impeccable init`. |

The five screens: Sign in, Verify your ID (a form with native date fields
and an error state), Home, Shift proposal, and Proposal expired (the ended
state).

## How the candidates were made

- The copy and screens were fixed first (`content.md`), so the comparison is
  about design only.
- Each candidate took a different position on palette, typeface, density,
  shape and emotional register, and listed the other two as
  anti-references. The current prototype look (`specs/plotline.html`) was
  treated as evidence of the product, not as a constraint.
- Each was built independently, then checked for React Native feasibility
  (fonts, shadows versus Android elevation, SVG needs, contrast) and
  critiqued with the Impeccable skill.

## Adopting a candidate

1. Pick a letter.
2. Its `direction.md` becomes the direction contract for the app-wide
   revamp. The overnight redesign run takes it as
   "adopt design-candidates/<X>/direction.md as the direction contract".
3. That run starts from `main`, so either merge this branch first or copy
   the chosen `direction.md` (and this folder, if you want the comps for
   reference) onto `main` before starting it.
4. Fonts named in `direction.md` map to `@expo-google-fonts/*` packages. Any
   that are new have to be installed as part of the revamp. So does
   `react-native-svg` if the direction's icons or signature move need it.

The product's full design lives in a private specs repo. Nothing here
restates it.
