const PLACEHOLDER_PATTERN = /\[[^\]\n]{1,60}\]/g;

export function findPlaceholders(text) {
  return [...new Set(text.match(PLACEHOLDER_PATTERN) ?? [])];
}
