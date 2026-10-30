/**
 * Query-string helpers for the API client.
 *
 * Kept dependency-free (no Vite/import.meta usage) so it can be unit-tested
 * directly with Node.
 */

const isExcluded = (value) => value === undefined || value === null || value === "";

/**
 * Append `params` to `url` as a query string.
 *
 * - Excludes `undefined`, `null`, and empty-string values.
 * - Preserves `0` and `false`.
 * - Supports arrays as repeated keys.
 * - Respects an existing query string (and hash fragment).
 * - Encodes values exactly once via URLSearchParams.
 *
 * @param {string} url
 * @param {Record<string, unknown>|undefined|null} params
 * @returns {string}
 */
export function appendQueryParams(url, params) {
  if (!params || typeof params !== "object") return url;

  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isExcluded(item)) search.append(key, String(item));
      }
      continue;
    }
    if (!isExcluded(value)) search.append(key, String(value));
  }

  const queryString = search.toString();
  if (!queryString) return url;

  const hashIndex = url.indexOf("#");
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);

  let separator = "?";
  if (base.includes("?")) {
    separator = base.endsWith("?") || base.endsWith("&") ? "" : "&";
  }

  return `${base}${separator}${queryString}${hash}`;
}
