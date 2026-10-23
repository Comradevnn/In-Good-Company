// node --test theme/palettes.test.mjs (from mobile/) — pure logic, no app runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const THEME_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_DIR = path.resolve(THEME_DIR, '..');

// TEMPORARY: files (relative to mobile/) that still hold hex/rgb/named colours and have not been migrated to
// role tokens yet. Hits in these files are reported, not failed. Later phases shrink this to empty.
const PENDING_MIGRATION = new Set([
  'screens/BuddiesScreen.js',
  'screens/OrgHomeScreen.js',
  'screens/RatingScreen.js',
]);

// ---------------------------------------------------------------------------------------------------------
// Loading the theme modules. They are written for Metro (ESM syntax in .js files without "type": "module"),
// so copy them into a fresh temp dir as .mjs, rewrite relative imports, and import by file URL. A fresh dir
// per load also means a fresh module cache, which lets a test set EXPO_PUBLIC_PALETTE before importing.
async function loadTheme(envPalette) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'palettes-'));
  fs.mkdirSync(path.join(dir, 'palettes'));
  const copy = (srcDir, rel) => {
    const src = fs.readFileSync(path.join(srcDir, rel), 'utf8');
    const out = src.replace(/(from\s+)'(\.\/[^']+)'/g, (_, from, spec) => {
      const target = path.join(srcDir, path.dirname(rel), spec);
      const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
      return `${from}'${spec}${isDir ? '/index.mjs' : '.mjs'}'`;
    });
    fs.writeFileSync(path.join(dir, rel.replace(/\.js$/, '.mjs')), out);
  };
  for (const f of fs.readdirSync(path.join(THEME_DIR, 'palettes'))) {
    if (f.endsWith('.js')) copy(THEME_DIR, path.join('palettes', f));
  }
  copy(THEME_DIR, 'colors.js');
  copy(THEME_DIR, 'people.js');

  const saved = process.env.EXPO_PUBLIC_PALETTE;
  if (envPalette === undefined) delete process.env.EXPO_PUBLIC_PALETTE;
  else process.env.EXPO_PUBLIC_PALETTE = envPalette;
  try {
    const url = (rel) => pathToFileURL(path.join(dir, rel)).href;
    const [index, derive, colorsMod, people] = await Promise.all([
      import(url('palettes/index.mjs')),
      import(url('palettes/derive.mjs')),
      import(url('colors.mjs')),
      import(url('people.mjs')),
    ]);
    return { ...index, ...derive, ...colorsMod, ...people };
  } finally {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_PALETTE;
    else process.env.EXPO_PUBLIC_PALETTE = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const base = await loadTheme(undefined);
const { palettes, paletteNames } = base;
const REFERENCE = palettes.calmTonalShade;

// ---------------------------------------------------------------------------------------------------------
// Colour maths, ported from design-candidates/B-schemes/tools/colormath.mjs (WCAG 2.x contrast, Machado 2009
// colour-blindness simulation, CIEDE2000).
const hexRe = /^#[0-9A-Fa-f]{6}$/;
function parseHex(hex) {
  if (!hexRe.test(hex)) throw new Error(`not a solid hex colour: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
function toHex(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const CVD_TYPES = Object.keys(CVD);
function simulate(hex, type) {
  if (type === 'normal') return toHex(parseHex(hex));
  const lin = parseHex(hex).map(toLinear);
  const out = CVD[type].map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  return toHex(out.map((v) => toGamma(Math.min(1, Math.max(0, v)))));
}
function toLab(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE(a, b) {
  const [L1, a1, b1] = toLab(a);
  const [L2, a2, b2] = toLab(b);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (x, y) => (x === 0 && y === 0 ? 0 : (Math.atan2(y, x) / rad + 360) % 360);
  const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360;
    hbp /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
    + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// Token names in check-scheme.mjs are kebab-case; palettes use camelCase.
const camel = (k) => k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

const TEXT = 4.5, LARGE = 3, UI = 3;
const DE_FAIL = 10, DE_WARN = 20; // CIEDE2000: under 10 hard to tell apart (FLAG), under 20 close (WARN)

// Same list, labels and kinds as design-candidates/B-schemes/tools/check-scheme.mjs.
const PAIRS = [
  ['ink', 'paper', 'text', 'body text on the ground'],
  ['ink', 'surface', 'text', 'text in fields, chips, tags, secondary buttons'],
  ['ink', 'tint', 'text', 'cards, list rows, stats'],
  ['ink', 'field', 'text', 'text on the field (hero, Home status card)'],
  ['ink', 'field-tint', 'text', 'plan card, safety notice'],
  ['ink', 'person-1-tint', 'text', 'partner card'],
  ['ink', 'accent-tint', 'text', 'prototype-stage notice'],
  ['ink', 'accent', 'text', 'Deeds badge, Daytime and Free plan tags'],
  ['ink', 'selected', 'text', 'selected chip label'],
  ['ink', 'success-tint', 'text', 'photo captured card'],
  ['ink', 'danger-tint', 'text', 'value in a field with an error'],
  ['ink', 'person-1', 'text', 'initial on person-1 disc / avatar'],
  ['ink', 'person-2', 'text', 'initial on person-2 disc'],
  ['ink', 'person-3', 'text', 'initial on person-3 disc'],
  ['ink', 'lens-others', 'text', 'text on the lens of two other people'],
  ['ink-2', 'paper', 'text', 'secondary text'],
  ['ink-2', 'surface', 'text', 'secondary text on surfaces'],
  ['ink-2', 'tint', 'text', 'secondary text on cards'],
  ['ink-2', 'field-tint', 'text', 'secondary text on field tint'],
  ['ink-2', 'person-1-tint', 'text', 'secondary text on partner card'],
  ['ink-2', 'accent-tint', 'text', 'secondary text on notice'],
  ['ink-3', 'surface', 'text', 'placeholder in a field'],
  ['ink-3', 'tint', 'text', 'placeholder on tint'],
  ['on-ink', 'ink', 'text', 'primary button label, ink tags and cards'],
  ['on-ink-2', 'ink', 'text', 'fine print on the ink deposit card'],
  ['accent', 'ink', 'large', 'the hold numeral on the ink card (56px)'],
  ['on-lens', 'lens-1', 'large', 'shift time on the you + person-1 lens (22-38px bold)'],
  ['on-lens', 'lens-1', 'text', 'small clock glyph and any body text on lens-1'],
  ['on-lens', 'lens-2', 'text', 'text or glyph on the you + person-2 lens'],
  ['on-lens', 'lens-3', 'text', 'text or glyph on the you + person-3 lens'],
  ['on-you', 'you', 'ui', 'person icon on your disc'],
  ['on-success', 'success', 'ui', 'check icon on the success disc'],
  ['danger', 'paper', 'text', 'error message'],
  ['danger', 'surface', 'text', 'error icon on a field'],
  ['danger', 'danger-tint', 'text', 'error inside a field'],
  ['off-fg', 'off-bg', 'text', 'disabled button (exempt; B holds it at 4.5)'],
  ['edge', 'surface', 'ui', 'field and chip borders'],
  ['edge', 'tint', 'ui', 'borders on tint'],
  ['ink', 'surface', 'ui', 'back button, switch, secondary button outline'],
  ['success', 'success-tint', 'ui', 'dashed border of the photo card'],
  ['danger', 'danger-tint', 'ui', 'error field border'],
  ['unread', 'surface', 'ui', 'unread dot on the bell button'],
  ['empty-ring', 'paper', 'ui', 'dashed ring on the expired screen'],
  ['scrollbar', 'paper', 'ui', 'scroll indicator (informational)'],
];

// Colours that must stay distinguishable (people, lenses, field); same construction as check-scheme.mjs.
const PEOPLE = ['you', 'person-1', 'person-2', 'person-3'];
const LENSES = [['lens-1', 'you', 'person-1'], ['lens-2', 'you', 'person-2'], ['lens-3', 'you', 'person-3']];
function separationPairs() {
  const sep = [];
  for (let i = 0; i < PEOPLE.length; i++) for (let j = i + 1; j < PEOPLE.length; j++) sep.push([PEOPLE[i], PEOPLE[j], 'two people']);
  for (const p of PEOPLE) sep.push([p, 'field', 'a disc on the field']);
  for (const [lens, a, b] of LENSES) { sep.push([lens, a, 'lens vs its disc']); sep.push([lens, b, 'lens vs its disc']); }
  sep.push(['lens-1', 'lens-2', 'two lenses'], ['lens-1', 'lens-3', 'two lenses'], ['lens-2', 'lens-3', 'two lenses']);
  sep.push(['lens-1', 'field', 'lens on the field'], ['success', 'lens-1', 'success state vs the main lens']);
  sep.push(['success', 'field', 'success state vs the field']);
  return sep;
}

// Matches the WARN count in each palette's check.txt under design-candidates/.
const EXPECTED_WARNS = {
  calmTonalShade: 9, calmTonal: 10, calm: 11, mossShadeTonal: 8, mossShade: 9, moss: 9, mossLinen: 9, cool: 8, warm: 8,
};

function colourBlindReport(p) {
  const flags = [], warns = [];
  for (const [a, b, why] of separationPairs()) {
    const ca = p[camel(a)], cb = p[camel(b)];
    if (ca === cb) {
      if (why !== 'a disc on the field') flags.push(`${a} = ${b} ${ca} (identical colours)`);
      continue;
    }
    const des = ['normal', ...CVD_TYPES].map((type) => [type, deltaE(simulate(ca, type), simulate(cb, type))]);
    const worst = des.reduce((m, d) => (d[1] < m[1] ? d : m));
    const line = `${a} ${ca} vs ${b} ${cb} (${why}) ` + des.map(([k, d]) => `${k.slice(0, 4)} ${d.toFixed(1)}`).join(', ');
    if (worst[1] < DE_FAIL) flags.push(line);
    else if (worst[1] < DE_WARN) warns.push(line);
  }
  return { flags, warns };
}

// ---------------------------------------------------------------------------------------------------------
test('every palette has exactly the same key set as calmTonalShade', () => {
  const want = Object.keys(REFERENCE).sort();
  for (const name of paletteNames) {
    const got = Object.keys(palettes[name]).sort();
    const missing = want.filter((k) => !got.includes(k));
    const extra = got.filter((k) => !want.includes(k));
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, `${name} key diff`);
  }
});

test('every palette value is a 6-digit hex colour, except statusBar', () => {
  for (const name of paletteNames) {
    for (const [key, value] of Object.entries(palettes[name])) {
      if (key === 'statusBar') assert.ok(value === 'dark' || value === 'light', `${name}.statusBar is "${value}"`);
      else assert.match(value, hexRe, `${name}.${key} is "${value}"`);
    }
  }
});

test('statusBar is dark exactly when black text contrasts at least as much with field as white does', () => {
  for (const name of paletteNames) {
    const p = palettes[name];
    const expected = contrast('#000000', p.field) >= contrast('#FFFFFF', p.field) ? 'dark' : 'light';
    assert.equal(p.statusBar, expected, `${name}.statusBar`);
    const onPaper = contrast('#000000', p.paper) >= contrast('#FFFFFF', p.paper) ? 'dark' : 'light';
    assert.equal(p.statusBar, onPaper, `${name}.statusBar should also suit paper`);
  }
});

test('every palette meets WCAG contrast for each pair B uses (informational pairs are reported only)', (t) => {
  const failures = [];
  for (const name of paletteNames) {
    const p = palettes[name];
    for (const [fg, bg, kind, where] of PAIRS) {
      const ratio = contrast(p[camel(fg)], p[camel(bg)]);
      const min = kind === 'text' ? TEXT : kind === 'large' ? LARGE : UI;
      if (ratio >= min) continue;
      const line = `${name}: ${fg} on ${bg} ${ratio.toFixed(2)} < ${min} (${where})`;
      if (where.includes('informational') || where.includes('exempt')) t.diagnostic(`NOTE ${line}`);
      else failures.push(line);
    }
  }
  assert.deepEqual(failures, []);
});

test('colour-blind separation: no FLAG in any palette, and the WARN lists match the documented counts', (t) => {
  assert.deepEqual(Object.keys(EXPECTED_WARNS).sort(), [...paletteNames].sort(), 'EXPECTED_WARNS covers every palette');
  for (const name of paletteNames) {
    const { flags, warns } = colourBlindReport(palettes[name]);
    for (const w of warns) t.diagnostic(`WARN ${name}: ${w}`);
    assert.deepEqual(flags, [], `${name} has colour-blind FLAGs`);
    assert.equal(warns.length, EXPECTED_WARNS[name], `${name} WARN count (documented in its check.txt)`);
  }
});

test('derived pressed tokens exist, are valid hex and differ from their base', () => {
  const pairs = [['inkPressed', 'ink'], ['surfacePressed', 'surface'], ['tintPressed', 'tint'], ['fieldPressed', 'field'], ['accentPressed', 'accent']];
  for (const name of paletteNames) {
    const derived = base.withDerived(palettes[name]);
    for (const [token, from] of pairs) {
      assert.match(derived[token], hexRe, `${name}.${token}`);
      assert.notEqual(derived[token].toUpperCase(), derived[from].toUpperCase(), `${name}.${token} should differ from ${from}`);
    }
  }
  for (const [token, from] of pairs) {
    assert.match(base.colors[token], hexRe, `colors.${token}`);
    assert.notEqual(base.colors[token].toUpperCase(), base.colors[from].toUpperCase(), `colors.${token} should differ from ${from}`);
  }
  assert.equal(base.mix('#000000', '#FFFFFF', 0.5), '#808080');
});

test('colors.js uses the default palette with no env var, honours a valid override, and falls back on an unknown name', async () => {
  assert.equal(base.DEFAULT_PALETTE, 'calmTonalShade');
  assert.equal(base.paletteName, 'calmTonalShade');
  assert.equal(base.colors.field, palettes.calmTonalShade.field);

  const override = await loadTheme('mossShadeTonal');
  assert.equal(override.paletteName, 'mossShadeTonal');
  assert.equal(override.colors.field, override.palettes.mossShadeTonal.field);
  assert.notEqual(override.colors.field, base.colors.field);

  const unknown = await loadTheme('no-such-palette');
  assert.equal(unknown.paletteName, 'calmTonalShade');
  assert.equal(unknown.colors.field, palettes.calmTonalShade.field);
  assert.equal(base.resolvePaletteName('moss'), 'moss');
  assert.equal(base.resolvePaletteName(''), 'calmTonalShade');
  assert.equal(base.resolvePaletteName(undefined), 'calmTonalShade');
});

test('people: person keys are stable, "you" for me, and spread over all three keys', () => {
  const { personKeyFor, personColorFor, onPersonColor, PERSON_KEYS, colors } = base;
  assert.deepEqual(PERSON_KEYS, ['person1', 'person2', 'person3']);
  assert.equal(personKeyFor(42, 42), 'you');
  assert.equal(personKeyFor('42', 42), 'you');
  assert.notEqual(personKeyFor(null, null), 'you');
  assert.equal(personKeyFor(7, 99), personKeyFor(7, 99));
  assert.equal(personKeyFor(7, 99), personKeyFor(7, 123), 'the key does not depend on who is looking');
  const counts = { person1: 0, person2: 0, person3: 0 };
  for (let id = 1; id <= 300; id++) {
    const key = personKeyFor(id, 0);
    assert.ok(PERSON_KEYS.includes(key), `unexpected key ${key}`);
    counts[key]++;
  }
  for (const key of PERSON_KEYS) assert.ok(counts[key] > 30, `${key} only got ${counts[key]} of 300`);
  assert.equal(personColorFor(5, 5), colors.you);
  assert.equal(onPersonColor('you'), colors.onYou);
  assert.equal(onPersonColor('person2'), colors.ink);
});

test('people: lensFor is order-free, maps per the rules, and follows a swapped palette', async () => {
  const check = (m) => {
    const { lensFor, onLensFor, colors } = m;
    assert.equal(lensFor('you', 'person1'), colors.lens1);
    assert.equal(lensFor('you', 'person2'), colors.lens2);
    assert.equal(lensFor('you', 'person3'), colors.lens3);
    for (const k of ['person1', 'person2', 'person3']) assert.equal(lensFor(k, 'you'), lensFor('you', k));
    assert.equal(lensFor('person1', 'person2'), colors.lensOthers);
    assert.equal(lensFor('person2', 'person1'), colors.lensOthers);
    assert.equal(lensFor('person2', 'person2'), colors.lensOthers);
    assert.equal(onLensFor('person1', 'person3'), colors.ink);
    assert.equal(onLensFor('you', 'person3'), colors.onLens);
    assert.equal(onLensFor('person2', 'you'), colors.onLens);
  };
  check(base);
  const override = await loadTheme('warm');
  check(override);
  assert.equal(override.lensFor('you', 'person1'), override.palettes.warm.lens1);
  assert.notEqual(override.lensFor('you', 'person1'), base.lensFor('you', 'person1'));
});

test('app.json native chrome matches the active palette', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(MOBILE_DIR, 'app.json'), 'utf8'));
  const msg = 'app.json native chrome does not match the active palette: update the fields listed in docs/THEMING.md';
  const active = base.palettes[base.paletteName];
  const same = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
  assert.ok(same(appJson.expo.backgroundColor, active.paper), `${msg} (expo.backgroundColor)`);
  assert.ok(same(appJson.expo.android.adaptiveIcon.backgroundColor, active.field), `${msg} (expo.android.adaptiveIcon.backgroundColor)`);
});

// ---------------------------------------------------------------------------------------------------------
// Lint: no colour literals outside theme/palettes/. Named colours are only flagged where they are used as a
// value: right after a colour-like prop or style key (`color: 'white'`, `fill="black"`,
// `placeholderTextColor={'gray'}`), so copy such as 'Green' in a label is not a hit. 'transparent' is allowed.
const NAMED = ['white', 'black', 'red', 'gray', 'grey', 'green', 'blue', 'yellow', 'orange', 'pink', 'purple', 'brown',
  'cyan', 'magenta', 'silver', 'gold', 'navy', 'teal', 'maroon', 'olive', 'lime', 'aqua', 'fuchsia', 'violet', 'indigo',
  'beige', 'ivory', 'coral', 'salmon', 'tan', 'crimson', 'lavender'];
const HEX_RE = /['"`]#[0-9A-Fa-f]{3,8}['"`]/;
const FUNC_RE = /\b(?:rgb|rgba|hsl|hsla)\(/;
const NAMED_RE = new RegExp(
  `\\b(?:[A-Za-z]*[Cc]olor|fill|stroke|tintColor|underlayColor|activeOpacityColor)\\s*[:=]\\s*\\{?\\s*['"\`](?:${NAMED.join('|')})['"\`]`, 'i');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.expo' || entry.name === 'palettes' && dir === THEME_DIR) continue;
      walk(full, out);
    } else if (/\.jsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

test('no hex, rgb or named colour literals outside theme/palettes/ (pending files are reported only)', (t) => {
  const failures = [];
  const seenPending = new Set();
  for (const file of walk(MOBILE_DIR)) {
    const rel = path.relative(MOBILE_DIR, file).split(path.sep).join('/');
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (!(HEX_RE.test(code) || FUNC_RE.test(code) || NAMED_RE.test(code))) return;
      const hit = `${rel}:${i + 1}: ${line.trim().slice(0, 100)}`;
      if (PENDING_MIGRATION.has(rel)) { seenPending.add(rel); t.diagnostic(`pending ${hit}`); } else failures.push(hit);
    });
  }
  t.diagnostic(`files with pending hits: ${seenPending.size} of ${PENDING_MIGRATION.size} listed`);
  assert.deepEqual(failures, [], 'colour literals found outside theme/palettes/; use role tokens from theme/colors.js');
});

test('every file in PENDING_MIGRATION still exists', () => {
  const missing = [...PENDING_MIGRATION].filter((rel) => !fs.existsSync(path.join(MOBILE_DIR, rel)));
  assert.deepEqual(missing, [], 'remove migrated or deleted files from PENDING_MIGRATION');
});

test('legacy colour aliases are tracked in LEGACY_COLOR_KEYS (a later phase asserts they are gone)', () => {
  assert.ok(Array.isArray(base.LEGACY_COLOR_KEYS));
  for (const key of base.LEGACY_COLOR_KEYS) assert.ok(key in base.colors, `colors.${key} should still be defined`);
});
