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

/** A run of suggestions under one heading, in the shape Base UI lists grouped items. */
export interface TokenSuggestionGroup {
  value: string | undefined;
  items: TokenSuggestion[];
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

/** Runs of suggestions with the same group, in the given order. */
export function groupSuggestions(suggestions: readonly TokenSuggestion[]): TokenSuggestionGroup[] {
  const groups: TokenSuggestionGroup[] = [];

  for (const suggestion of suggestions) {
    const last = groups.at(-1);

    if (last !== undefined && last.value === suggestion.group) {
      last.items.push(suggestion);
    } else {
      groups.push({ value: suggestion.group, items: [suggestion] });
    }
  }

  return groups;
}

/** The nearest ancestor that scrolls vertically, such as a sheet or a side panel. */
export function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);

    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
  }

  return null;
}
