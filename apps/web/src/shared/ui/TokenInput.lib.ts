/** A value the field offers while typing. */
export interface TokenSuggestion {
  /** What becomes the chip. */
  value: string;
  /** A name shown instead of the value, such as a device for its address. */
  label?: string;
  /** What the value is: a network, a protocol, the address behind a name. */
  hint?: string;
  /** Heading of the group the suggestion is listed under; suggestions of one group go together. */
  group?: string;
}

export interface TokenSuggestionGroup {
  label: string | undefined;
  items: { suggestion: TokenSuggestion; index: number }[];
}

/**
 * Suggestions left to offer: a value already on a chip is not offered again,
 * and the typed text narrows the rest by the value, the name or the hint, in the given order.
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
      [suggestion.value, suggestion.label, suggestion.hint].some((text) => (text ?? '').toLowerCase().includes(query))
  );
}

/** Runs of suggestions with the same group, each item with its index in the whole list. */
export function groupSuggestions(suggestions: readonly TokenSuggestion[]): TokenSuggestionGroup[] {
  const groups: TokenSuggestionGroup[] = [];

  for (const [index, suggestion] of suggestions.entries()) {
    const last = groups.at(-1);

    if (last !== undefined && last.label === suggestion.group) {
      last.items.push({ suggestion, index });
    } else {
      groups.push({ label: suggestion.group, items: [{ suggestion, index }] });
    }
  }

  return groups;
}

/** The highlight after an arrow press: from nothing the first or the last, past either end it wraps around. */
export function movedHighlight(current: number | null, step: 1 | -1, count: number): number | null {
  if (count === 0) {
    return null;
  }

  if (current === null) {
    return step === 1 ? 0 : count - 1;
  }

  return (current + step + count) % count;
}

/** The id of an option in the suggestion list: the input names the highlighted one in `aria-activedescendant`. */
export function tokenOptionId(listId: string, index: number): string {
  return `${listId}-option-${String(index)}`;
}
