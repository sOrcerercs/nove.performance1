/**
 * Diacritic-insensitive folding for search.
 *
 * Turkish is routinely typed without diacritics — "gecmis" for "geçmiş",
 * "donem" for "dönem" — so comparing raw strings makes the search look broken.
 * The dotted/dotless i pair is handled explicitly: `İ` lowercases to `i̇`
 * (i plus a combining dot) under a Turkish locale, which then fails to match a
 * plain `i`, so the mapping is applied before lowercasing.
 */
const FOLD: Record<string, string> = {
  ç: 'c', Ç: 'c',
  ğ: 'g', Ğ: 'g',
  ı: 'i', I: 'i', İ: 'i', i: 'i',
  ö: 'o', Ö: 'o',
  ş: 's', Ş: 's',
  ü: 'u', Ü: 'u',
  â: 'a', Â: 'a',
  î: 'i', Î: 'i',
  û: 'u', Û: 'u',
}

export function foldForSearch(input: string): string {
  let out = ''
  for (const ch of input) {
    out += FOLD[ch] ?? ch.toLowerCase()
  }
  return out
}

/** True when every whitespace-separated term appears somewhere in the haystack. */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = foldForSearch(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const folded = foldForSearch(haystack)
  return terms.every((t) => folded.includes(t))
}
