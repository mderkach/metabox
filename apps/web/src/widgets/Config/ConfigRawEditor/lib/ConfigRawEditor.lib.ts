/** Positions of all occurrences of the search string; case is ignored. */
export function findMatches(text: string, query: string): number[] {
  if (query.length === 0) {
    return [];
  }

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const found: number[] = [];

  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
    found.push(at);
  }

  return found;
}
