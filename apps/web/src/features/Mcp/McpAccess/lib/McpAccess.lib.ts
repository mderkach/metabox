/**
 * Puts the text on the clipboard. The panel is usually opened over plain http, which is not a
 * secure context: the browser then has no clipboard API, and the text is copied from a temporary
 * selected field. Returns false when both ways fail. `host` takes the temporary field: inside a
 * modal dialog it must be an element of the dialog, or the focus trap takes the focus back.
 */
export async function copyText(text: string, host: HTMLElement = document.body): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);

    return true;
  } catch {
    return copyBySelection(text, host);
  }
}

function copyBySelection(text: string, host: HTMLElement): boolean {
  const field = document.createElement('textarea');
  const focused = document.activeElement;

  field.value = text;
  field.readOnly = true;
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  host.append(field);
  field.focus({ preventScroll: true });
  field.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
}
