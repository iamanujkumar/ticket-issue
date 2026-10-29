const RATE_DECIMALS = 3;

export function ratio(part, whole) {
  if (!whole) return null;
  return Number((part / whole).toFixed(RATE_DECIMALS));
}

export function roundTo(value, decimals) {
  return value === null || value === undefined ? null : Number(Number(value).toFixed(decimals));
}
