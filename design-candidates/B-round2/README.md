# Overprint colour schemes, round 2

Round 2 of the colour work on design candidate B ("Overprint", `../B/`).
Round 1 (`../B-schemes/`) recoloured B into five schemes. This round refines
two of them after the cofounder's feedback:

- fewer colours on a screen;
- keep the Moss green field and the Calm lavender field;
- use the pale cyan card shade (#E9F4F8) for the shift and partner type of card;
- drop the blue "you" disc, the yellow/marigold/mustard person disc and accent,
  and the olive lens where they overlap.

Each scheme keeps its round-1 character: its other people, their lenses and
its success card. Only "you", the first person (Jordan) with the partner card,
the accent and the overlap lens are rebuilt from deep, mid and pale tones of
the field hue. Layout, type, copy, sizes, radii and icons are identical to B.

## Open it

Open `compare.html` in a browser. It shows Sign in, Home and Shift proposal
for the four variants and for round-1 Moss and Calm, side by side (scroll each
row sideways), plus the palettes, a comparison table and a recommendation.
Each variant's full set of frames (all five plus the full-scroll extras) is in
its own `index.html`.

## What's here

| Path | What it is |
|---|---|
| `moss-shade/` | Round-1 Moss with only the card tint changed to the cyan shade. The controlled baseline: does the shade alone help? |
| `moss-shade-tonal/` | `moss-shade` with "you", Jordan, the partner card, the accent and the lens rebuilt in greens. |
| `calm-tonal/` | Round-1 Calm with the same tokens rebuilt in violet and lavender. Cards keep Calm's lavender tint. |
| `calm-tonal-shade/` | `calm-tonal` with the cyan shade for the cards. |
| `<variant>/index.html` | `../B-schemes/base.html` with only the `SCHEME COLOURS` block changed. |
| `<variant>/scheme.md` | Tokens changed from round 1, token table with contrast ratios, people and lens tables, hue families per frame before and after, rationale, risks, a ready-to-paste `colors.js` export and the mapping from B's colour names. |
| `<variant>/check.txt` | Output of `../B-schemes/tools/check-scheme.mjs` for that variant. All four: 0 contrast failures, 0 colour-blind flags. |
| `compare.html` | The comparison page (self-contained). |
| `tools/build-compare.mjs` | Rebuilds `compare.html` from the variant folders, round-1 Moss and Calm, and `tools/compare-notes.json`. Run `node tools/build-compare.mjs` from this folder. Adapted from round 1's builder, which is unchanged. |

To re-check a variant from the repo root:
`node design-candidates/B-schemes/tools/check-scheme.mjs design-candidates/B-round2/<variant>/index.html`

## Adopting a variant

1. Pick one.
2. Copy the `colors.js` export from its `scheme.md` into
   `mobile/theme/colors.js`, keeping the palette as swappable role tokens
   (so a later palette change stays a one-file change).
3. Keep `../B/direction.md` for everything else (type, spacing, radii,
   components, the overlap rule). Read its colour names through the mapping
   table at the end of the variant's `scheme.md`.
4. For the overnight redesign run: "adopt design-candidates/B/direction.md
   with the palette from design-candidates/B-round2/<variant>/scheme.md".
   That run starts from `main`, so first merge `explore/b-color-schemes`,
   then this branch (`explore/b-round2`, which sits on top of it), or copy
   those files onto `main`.

People, organizations and addresses in the frames are made up. The product's
full design lives in a private specs repo; nothing here restates it.
