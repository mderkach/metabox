/**
 * Query words in lower case. All must match: `telegram direct` finds
 * connections to telegram that went direct, not a union of two lists.
 *
 * Parsing is deliberately moved out of the filter callback: on five thousand rows it
 * would repeat for every row of every snapshot.
 */
export function toQueryWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/u).filter(Boolean);
}

export function matchesWords(haystack: string, words: string[]): boolean {
  return words.every((word) => haystack.includes(word));
}
