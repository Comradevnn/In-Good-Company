#!/usr/bin/env node
// Contrast and colour-blindness checker for B colour schemes.
//
// Usage:
//   node tools/check-scheme.mjs <scheme>/index.html [--out <file>]
//   node tools/check-scheme.mjs <tokens>.json      [--out <file>]
//
// Reads the scheme's colour tokens (the :root block of a scheme's index.html,
// or a flat JSON object of token name -> hex), checks every text/background
// pair B's screens use against WCAG AA, checks UI boundaries at 3:1, and
// simulates protanopia, deuteranopia and tritanopia on the people, lenses
// and field to flag colours that become hard to tell apart.
// Contrast below the minimum is a FAIL (exit code 1). Colour-blind
// separation problems are FLAGs: fix them, or document the non-colour cue
// (initial, icon, ring) that carries the meaning instead. No dependencies.

import { readFileSync, writeFileSync } from 'node:fs';
import { contrast, deltaE, simulate, CVD_TYPES } from './colormath.mjs';

const TEXT = 4.5, LARGE = 3, UI = 3;
const DE_FAIL = 10, DE_WARN = 20; // CIEDE2000: under 10 hard to tell apart (FLAG), under 20 close (WARN)

// Every pair B's frames use. kind: text (4.5), large (3, text >= 24px or bold >= 18.66px), ui (3).
const PAIRS = [
  // ink on every surface it sits on
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
  // UI boundaries
  ['edge', 'surface', 'ui', 'field and chip borders'],
  ['edge', 'tint', 'ui', 'borders on tint'],
  ['ink', 'surface', 'ui', 'back button, switch, secondary button outline'],
  ['success', 'success-tint', 'ui', 'dashed border of the photo card'],
  ['danger', 'danger-tint', 'ui', 'error field border'],
  ['unread', 'surface', 'ui', 'unread dot on the bell button'],
  ['empty-ring', 'paper', 'ui', 'dashed ring on the expired screen'],
  ['scrollbar', 'paper', 'ui', 'scroll indicator (informational)'],
];

// Colours that must stay distinguishable (people, lenses, field). Identity is
// also carried by initials and the person icon; a flag means colour alone is
// not enough there.
const PEOPLE = ['you', 'person-1', 'person-2', 'person-3'];
const LENSES = [['lens-1', 'you', 'person-1'], ['lens-2', 'you', 'person-2'], ['lens-3', 'you', 'person-3']];

function loadTokens(path) {
  const raw = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) return JSON.parse(raw);
  const start = raw.indexOf('SCHEME COLOURS');
  const end = raw.indexOf('end scheme colours');
  if (start < 0 || end < 0) throw new Error('no SCHEME COLOURS block found in ' + path);
  const tokens = {};
  for (const m of raw.slice(start, end).matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g)) tokens[m[1]] = m[2].toUpperCase();
  return tokens;
}

function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const outIdx = args.indexOf('--out');
  if (!file) { console.error('usage: node check-scheme.mjs <index.html|tokens.json> [--out file]'); process.exit(2); }
  const t = loadTokens(file);
  const lines = [];
  const say = (s = '') => lines.push(s);
  let fails = 0, flags = 0, warns = 0;
  const need = (name) => { if (!t[name]) throw new Error(`token --${name} missing`); return t[name]; };

  say(`Scheme check: ${file}`);
  say(`Tokens read: ${Object.keys(t).length}`);
  say('');
  say(`CONTRAST (WCAG 2.x; text ${TEXT}:1, large text ${LARGE}:1, UI boundary ${UI}:1)`);
  for (const [fg, bg, kind, where] of PAIRS) {
    const r = contrast(need(fg), need(bg));
    const min = kind === 'text' ? TEXT : kind === 'large' ? LARGE : UI;
    const info = where.includes('informational') || where.includes('exempt');
    let verdict = r >= min ? 'PASS' : info ? 'NOTE' : 'FAIL';
    if (verdict === 'FAIL') fails++;
    say(`  ${verdict.padEnd(4)} ${r.toFixed(2).padStart(5)}  ${fg} ${t[fg]} on ${bg} ${t[bg]}  [${kind} >= ${min}]  ${where}`);
  }

  say('');
  say(`COLOUR-BLIND SEPARATION (CIEDE2000 after simulation; FLAG < ${DE_FAIL}, WARN < ${DE_WARN})`);
  const sep = [];
  for (let i = 0; i < PEOPLE.length; i++) for (let j = i + 1; j < PEOPLE.length; j++) sep.push([PEOPLE[i], PEOPLE[j], 'two people']);
  for (const p of PEOPLE) sep.push([p, 'field', 'a disc on the field']);
  for (const [lens, a, b] of LENSES) { sep.push([lens, a, 'lens vs its disc']); sep.push([lens, b, 'lens vs its disc']); }
  sep.push(['lens-1', 'lens-2', 'two lenses']); sep.push(['lens-1', 'lens-3', 'two lenses']); sep.push(['lens-2', 'lens-3', 'two lenses']);
  sep.push(['lens-1', 'field', 'lens on the field']); sep.push(['success', 'lens-1', 'success state vs the main lens']);
  sep.push(['success', 'field', 'success state vs the field']);
  for (const [a, b, why] of sep) {
    const ca = need(a), cb = need(b);
    if (ca === cb) {
      const rule = why === 'a disc on the field' ? 'equals the field: ring rule applies (never placed directly on it)' : 'identical colours';
      const v = why === 'a disc on the field' ? 'NOTE' : 'FLAG';
      if (v === 'FLAG') flags++;
      say(`  ${v.padEnd(4)}  ${a} = ${b} ${ca}  ${rule}`);
      continue;
    }
    const des = ['normal', ...CVD_TYPES].map((type) => [type, deltaE(simulate(ca, type), simulate(cb, type))]);
    const worst = des.reduce((m, d) => (d[1] < m[1] ? d : m));
    const v = worst[1] < DE_FAIL ? 'FLAG' : worst[1] < DE_WARN ? 'WARN' : 'PASS';
    if (v === 'FLAG') flags++; if (v === 'WARN') warns++;
    say(`  ${v.padEnd(4)}  ${a} ${ca} vs ${b} ${cb}  (${why})  ` + des.map(([k, d]) => `${k.slice(0, 4)} ${d.toFixed(1)}`).join(', '));
  }

  say('');
  say('LENS HUES (informational: a lens should read as the overprint of its two discs; judge by eye)');
  for (const [lens, a, b] of LENSES) say(`  ${lens} ${t[lens]} hue ${hueOf(t[lens])}  from ${a} hue ${hueOf(t[a])} + ${b} hue ${hueOf(t[b])}`);

  say('');
  say('SIMULATED COLOURS (people, lenses, field)');
  for (const k of [...PEOPLE, 'lens-1', 'lens-2', 'lens-3', 'lens-others', 'field', 'success']) {
    say(`  ${k.padEnd(11)} ${t[k]}  ` + CVD_TYPES.map((type) => `${type.slice(0, 4)} ${simulate(t[k], type)}`).join('  '));
  }
  say('');
  say(`RESULT: ${fails} contrast FAIL, ${flags} colour-blind FLAG, ${warns} WARN`);
  const text = lines.join('\n') + '\n';
  if (outIdx >= 0) writeFileSync(args[outIdx + 1], text);
  process.stdout.write(text);
  process.exit(fails ? 1 : 0);
}

main();
