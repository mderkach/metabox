/** Input types that take typed text, not a click or a pick. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'number', 'password', 'email', 'tel']);

/** Focus is in a field the user types into: a text input or a multiline field. */
export function isTextEntryFocused(): boolean {
  const element = document.activeElement;

  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type))
  );
}
