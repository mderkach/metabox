/** A value the field offers while typing, with what it is: a network name, a protocol. */
export interface TokenSuggestion {
  value: string;
  hint: string;
}

/**
 * Suggestions left to offer: a value already on a chip is not offered again,
 * and the typed text narrows the rest by the value or by its hint, in the given order.
 */
export function offeredSuggestions(
  suggestions: readonly TokenSuggestion[],
  tokens: readonly string[],
  typed: string
): TokenSuggestion[] {
  const query = typed.trim().toLowerCase();

  return suggestions.filter(
    (suggestion) =>
      !tokens.includes(suggestion.value) &&
      (suggestion.value.toLowerCase().includes(query) || suggestion.hint.toLowerCase().includes(query))
  );
}
