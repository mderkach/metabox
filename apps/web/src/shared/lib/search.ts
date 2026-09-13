/**
 * Слова запроса в нижнем регистре. Совпасть должны все: `telegram direct` ищет
 * соединения до телеграма, ушедшие напрямую, а не объединение двух списков.
 *
 * Разбор вынесен из колбэка отбора намеренно: на пяти тысячах строк (NFR-2) он
 * повторялся бы на каждую строку каждого снапшота.
 */
export function toQueryWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/u).filter(Boolean);
}

export function matchesWords(haystack: string, words: string[]): boolean {
  return words.every((word) => haystack.includes(word));
}
