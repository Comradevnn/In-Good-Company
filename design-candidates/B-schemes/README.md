# Overprint colour schemes

Design candidate B ("Overprint", `../B/`) redrawn in five colour schemes,
so the team can choose a palette on colour alone. Only colours differ:
the layout, type (Gabarito, Figtree), copy, sizes, radii, icons and the five
frames are identical to B. The control is B as drawn.

## Open it

Open `compare-schemes.html` in a browser. It shows Sign in, Home and Shift
proposal for the control and every scheme side by side (scroll each row
sideways), the palettes, a comparison table and a recommendation. Each
scheme's full set of frames (all five plus the full-scroll extras) is in its
own `index.html`.

## What's here

| Path | What it is |
|---|---|
| `base.html` | B with every colour moved into role tokens (field, ink, you, person-1..3, lens-1..3, accent, success, ...). Renders identically to B. Every scheme is this file with a different `SCHEME COLOURS` block. |
| `moss/`, `moss-linen/`, `warm/`, `cool/`, `calm/` | One folder per scheme: `index.html` (the frames), `scheme.md` (token table with contrast ratios, people and lens tables, rationale, risks, and a ready-to-paste `colors.js` export) and `check.txt` (checker output). |
| `control/check.txt` | The checker run on B's own colours, for reference. |
| `compare-schemes.html` | The comparison page (self-contained; built by `tools/build-compare.mjs`). |
| `tools/check-scheme.mjs` | Contrast and colour-blindness checker (Node, no dependencies): `node tools/check-scheme.mjs <scheme>/index.html`. Checks every text/background pair B uses against WCAG AA and simulates protanopia, deuteranopia and tritanopia on the people, lenses and field. |
| `tools/build-compare.mjs` | Rebuilds `compare-schemes.html` from `base.html`, the scheme folders and `tools/compare-notes.json`. |

Moss Linen uses the app's current linen ground on purpose, as an exception
to B's "no cream ground" rule, to test continuity with today's look.

## Adopting a scheme

1. Pick one.
2. Copy the `colors.js` export from its `scheme.md` into
   `mobile/theme/colors.js`, keeping the palette as swappable role tokens
   (so a later palette change stays a one-file change).
3. Keep `../B/direction.md` for everything else (type, spacing, radii,
   components, the overlap rule). Read its colour names through the mapping
   table at the end of each `scheme.md` (B's `pink` is the role `field`,
   `blue` is `you`, and so on).
4. For the overnight redesign run: "adopt design-candidates/B/direction.md
   with the palette from design-candidates/B-schemes/<scheme>/scheme.md".
   That run starts from `main`, so merge this branch first or copy those
   files onto `main` before starting it.

People, organizations and addresses in the frames are made up. The product's
full design lives in a private specs repo; nothing here restates it.
