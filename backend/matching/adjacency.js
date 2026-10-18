// Cause-area adjacency ("close match") table, rebuilt against the app's own
// six cause labels; the private spec owns the canonical list. Symmetric: if
// A lists B, B lists A.
const ADJACENCY_TABLE = {
  'Food banks & shelters': ['Community organizing'],
  'Community organizing': ['Food banks & shelters'],
  'Animal welfare': ['Environmental cleanups'],
  'Environmental cleanups': ['Animal welfare'],
  // People-facing care work with similar screening (owner decision, 2026-10).
  'Youth mentorship': ['Elder care'],
  'Elder care': ['Youth mentorship'],
};

module.exports = { ADJACENCY_TABLE };
