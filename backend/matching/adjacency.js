// Cause-area adjacency table for Step 1b close-match scoring (specs/
// in-good-company-matching-prompt.md). Symmetric: if A lists B, B lists A.
//
// DEMO SIMPLIFICATION: the spec's own adjacency table uses category names
// ("food insecurity", "environmental/sustainability", "arts & education")
// that don't match the 6 cause labels actually selectable in
// mobile/screens/CausesScreen.js — 4 of the spec's 10 categories
// ("disaster relief", "arts & education", "health & disability services",
// plus the naming mismatch on the other 6) aren't options a real test user
// can have at all. Rebuilt here against the app's real labels instead, so
// every entry is something two actual test users could trigger, at the
// cost of covering less than the spec's full table.
const ADJACENCY_TABLE = {
  'Food banks & shelters': ['Community organizing'],
  'Community organizing': ['Food banks & shelters'],
  'Animal welfare': ['Environmental cleanups'],
  'Environmental cleanups': ['Animal welfare'],
  'Youth mentorship': [],
  'Elder care': [],
};

module.exports = { ADJACENCY_TABLE };
