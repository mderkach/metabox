/**
 * Puts the text on the clipboard. Returns false when it cannot: the panel is usually opened over
 * plain http, which is not a secure context, and the browser then has no clipboard API.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);

    return true;
  } catch {
    return false;
  }
}
