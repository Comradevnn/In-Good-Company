#!/usr/bin/env node
// Builds compare-schemes.html: the control (B) and every scheme side by side.
//
// Usage (from design-candidates/B-schemes/): node tools/build-compare.mjs
//
// Every scheme is base.html with a different SCHEME COLOURS block, so the
// page inlines frames 1, 3 and 4 from base.html once per scheme and scopes
// each copy's colour tokens to a wrapper class. The result is one
// self-contained file (no iframes) that works on a phone. Narrative text
// (table cells, recommendation) comes from tools/compare-notes.json.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { contrast } from './colormath.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(ROOT + p, 'utf8');
const notes = JSON.parse(read('tools/compare-notes.json'));
const base = read('base.html');

function schemeTokens(html) {
  const block = html.slice(html.indexOf('SCHEME COLOURS'), html.indexOf('end scheme colours'));
  const t = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)) t[m[1]] = m[2].toUpperCase();
  return t;
}

// Base CSS, scoped under .cmp; page-layout rules dropped.
const css = base.slice(base.indexOf('<style>') + 7, base.indexOf('</style>'));
const DROP = /^(html|body|\.page-head\b.*|\.row-title|\.frames|figure|figcaption)$/;
let scoped = '';
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim(), body = m[2];
  if (sel === ':root') { scoped += `.cmp{${body}}\n`; continue; }
  if (DROP.test(sel)) continue;
  scoped += sel.split(',').map((s) => (s.trim() === '*' ? '.cmp *' : `.cmp ${s.trim()}`)).join(',') + `{${body}}\n`;
}

// Icon sprite and the device markup of frames 1, 3 and 4.
const sprite = base.match(/<svg[^>]*><defs>\s*<symbol[\s\S]*?<\/svg>/)[0];
const firstRow = base.slice(base.indexOf('<div class="frames">'), base.indexOf('</div>\n', base.indexOf('Proposal expired')));
const devices = [...firstRow.matchAll(/<figure>([\s\S]*?)<figcaption>([^<]*)<\/figcaption><\/figure>/g)].map((m) => ({ html: m[1], caption: m[2] }));
if (devices.length !== 5) throw new Error(`expected 5 frames in the first row of base.html, found ${devices.length}`);
const SHOW = [[0, 'Sign in'], [2, 'Home'], [3, 'Shift proposal']];

const schemes = notes.schemes.map((s) => {
  const file = s.slug === 'control' ? 'base.html' : `${s.slug}/index.html`;
  if (!existsSync(ROOT + file)) throw new Error(`missing ${file}`);
  return { ...s, file, tokens: schemeTokens(read(file)) };
});

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tokenCss = schemes.map((s) => `.cmp.s-${s.slug}{${Object.entries(s.tokens).map(([k, v]) => `--${k}:${v}`).join(';')}}`).join('\n');

const sw = (hex, label) => `<span class="sw"><i style="background:${hex}"></i><b>${esc(label)}</b><code>${hex}</code></span>`;
function swatches(s) {
  const t = s.tokens;
  return `<div class="swatches">${sw(t.field, 'field')}${sw(t.ink, 'ink')}${sw(t.you, 'you')}${sw(t['person-1'], 'person 1')}${sw(t['person-2'], 'person 2')}${sw(t['person-3'], 'person 3')}${sw(t['lens-1'], 'lens 1')}${sw(t['lens-2'], 'lens 2')}${sw(t['lens-3'], 'lens 3')}${sw(t.accent, 'accent')}${sw(t.paper, 'ground')}</div>`;
}

const rows = SHOW.map(([i, name]) => `
<section class="frame-row" aria-labelledby="row-${i}">
  <h2 id="row-${i}">${name}</h2>
  <div class="strip">${schemes.map((s) => `
    <figure class="cmp s-${s.slug}">${devices[i].html}<figcaption><b>${esc(s.name)}</b> · <a href="${s.file}">all frames</a></figcaption></figure>`).join('')}
  </div>
</section>`).join('\n');

const table = `<div class="tablebox"><table>
<thead><tr><th scope="col"></th>${schemes.map((s) => `<th scope="col">${esc(s.name)}</th>`).join('')}</tr></thead>
<tbody>
${[['mood', 'Mood'], ['ground', 'Ground'], ['contrast', 'Contrast'], ['colorblind', 'Colour-blind'], ['critique', 'Critique'], ['risk', 'Biggest risk']]
  .map(([k, label]) => `<tr><th scope="row">${label}</th>${schemes.map((s) => `<td>${s[k] ?? ''}</td>`).join('')}</tr>`).join('\n')}
<tr><th scope="row">Field / ink</th>${schemes.map((s) => `<td><code>${s.tokens.field}</code> / <code>${s.tokens.ink}</code><br><span class="muted">ink on field ${contrast(s.tokens.ink, s.tokens.field).toFixed(2)}:1</span></td>`).join('')}</tr>
<tr><th scope="row">Files</th>${schemes.map((s) => `<td><a href="${s.file}">frames</a>${s.slug === 'control' ? ' · <a href="control/check.txt">check</a>' : ` · <a href="${s.slug}/scheme.md">scheme.md</a> · <a href="${s.slug}/check.txt">check</a>`}</td>`).join('')}</tr>
</tbody></table></div>`;

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Overprint Colour Schemes</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@500;600;700&family=Gabarito:wght@700;800;900&display=swap" rel="stylesheet">
<style>
/* Page shell: a quiet neutral so the schemes carry all the colour. Single light look by choice. */
:root{--bg:#ECECEF;--panel:#FFFFFF;--fg:#1B1B26;--fg-2:#4A4A58;--line:#D6D6DE;--rec:#F7F7FB;color-scheme:light}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 'Figtree','Helvetica Neue',Arial,sans-serif;
  padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px));padding-block:32px 64px}
.wrap{max-width:1240px;margin:0 auto;display:flex;flex-direction:column;gap:36px}
h1{font-family:'Gabarito',sans-serif;font-weight:900;font-size:2.2rem;line-height:1.1;margin:0 0 8px;text-wrap:balance}
h2{font-family:'Gabarito',sans-serif;font-weight:800;font-size:1.4rem;margin:0 0 12px}
p{margin:0 0 10px;max-width:72ch}
.muted{color:var(--fg-2);font-size:.88rem}
a{color:#1E2A9E;text-underline-offset:3px}
code{font-size:.85em}
.rec{background:var(--rec);border:1px solid var(--line);border-radius:12px;padding:20px 22px}
.rec .tag{display:inline-block;font-weight:700;font-size:.8rem;letter-spacing:.04em;text-transform:uppercase;color:var(--fg-2);margin-bottom:6px}
.rec ul{margin:6px 0 0;padding-left:20px;max-width:76ch}.rec li{margin-bottom:6px}
.strip{display:flex;gap:24px;overflow-x:auto;padding:4px 2px 16px;scroll-snap-type:x proximity}
.strip figure{margin:0;flex:none;scroll-snap-align:start;display:flex;flex-direction:column;gap:10px}
.strip figcaption{font-size:15px;color:var(--fg-2)}
.strip figcaption b{color:var(--fg)}
.palettes{display:flex;flex-direction:column;gap:14px}
.pal{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.pal h3{margin:0 0 8px;font-size:1rem}
.swatches{display:flex;flex-wrap:wrap;gap:10px}
.sw{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:84px;font-size:12px;line-height:1.3}
.sw i{display:block;width:84px;height:40px;border-radius:8px;border:1px solid rgba(0,0,0,.12)}
.sw b{font-weight:700}.sw code{color:var(--fg-2);font-size:11px}
.tablebox{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
table{border-collapse:collapse;min-width:1100px;width:100%;font-size:.9rem}
th,td{text-align:left;vertical-align:top;padding:11px 12px;border-bottom:1px solid var(--line)}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
tbody th{color:var(--fg-2);width:110px}
a:focus-visible{outline:2px solid #1E2A9E;outline-offset:2px}
/* B's own CSS, scoped to each phone */
${scoped}
.cmp .device{flex:none}
${tokenCss}
</style></head><body>
${sprite}
<div class="wrap">
<header>
  <h1>Overprint in five colour schemes</h1>
  <p>Design candidate B ("Overprint") with only its colours changed, so the team can choose on colour alone. Everything else (layout, type, copy, the overlapping discs) is identical to B. The control is B as drawn. Scroll each row sideways to compare one screen across every scheme.</p>
</header>
<section class="rec" aria-labelledby="rec-h">
  <span class="tag">Recommendation, not a decision</span>
  <h2 id="rec-h">${notes.recommendation.title}</h2>
  <ul>${notes.recommendation.points.map((p) => `<li>${p}</li>`).join('')}</ul>
</section>
${rows}
<section aria-labelledby="pal-h"><h2 id="pal-h">Palettes</h2><div class="palettes">
${schemes.map((s) => `<div class="pal"><h3>${esc(s.name)}</h3>${swatches(s)}</div>`).join('\n')}
</div></section>
<section aria-labelledby="tab-h"><h2 id="tab-h">Side by side</h2>${table}</section>
<section aria-labelledby="how-h"><h2 id="how-h">How to adopt one</h2>${notes.adopt}</section>
</div>
</body></html>
`;

writeFileSync(ROOT + 'compare-schemes.html', page);
console.log(`wrote compare-schemes.html: ${schemes.length} schemes x ${SHOW.length} frames, ${Math.round(page.length / 1024)} KB`);
