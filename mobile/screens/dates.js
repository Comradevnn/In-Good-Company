// Dates are calendar days in the user's own timezone. toISOString() (UTC)
// shifted them by a day east of UTC on save, and new Date('YYYY-MM-DD')
// (also UTC) made the picker highlight the previous day west of UTC — so a
// returning user didn't see the dates they had entered.
export function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}
