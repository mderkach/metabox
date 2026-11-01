import { useEffect } from 'react';

import { isTextEntryFocused } from './focus';

/**
 * Keyboard shortcuts, in the `aria-keyshortcuts` notation: the control that
 * declares one is found by it, and a screen reader announces it from the same
 * attribute. A modifier is spelled for both platforms, the matching one wins.
 */
export const SHORTCUT = {
  Search: '/',
  Add: 'N',
  Apply: 'Control+S Meta+S',
} as const;

/**
 * Shortcuts the browser would act on itself when nothing on screen takes them:
 * "save page" is never what the panel user means.
 */
const SWALLOWED = new Set<string>(SHORTCUT.Apply.split(' '));

const MODIFIERS = [
  ['Control', 'ctrlKey'],
  ['Alt', 'altKey'],
  ['Meta', 'metaKey'],
] as const;

/** Physical keys whose character other layouts move: on the Russian one N types «т». */
const CODE_KEY: Readonly<Record<string, string>> = { Slash: '/' };

function keyOfCode(code: string): string | undefined {
  return code.startsWith('Key') ? code.slice('Key'.length) : CODE_KEY[code];
}

/**
 * The pressed combination in the `aria-keyshortcuts` notation, e.g. `Meta+S` or
 * `/`: once by the typed character, once by the physical key.
 */
function toShortcuts(event: KeyboardEvent): string[] {
  const modifiers = MODIFIERS.filter(([, flag]) => event[flag]).map(([name]) => name);
  const keys = new Set([event.key.length === 1 ? event.key.toUpperCase() : event.key, keyOfCode(event.code)]);

  return [...keys].flatMap((key) => (key === undefined ? [] : [[...modifiers, key].join('+')]));
}

/** A list or menu in focus takes letters for its own typeahead. */
function isTypingFocused(): boolean {
  return (
    isTextEntryFocused() ||
    document.activeElement?.closest('[role="combobox"],[role="listbox"],[role="menu"],[contenteditable="true"]') != null
  );
}

function isShown(element: HTMLElement): boolean {
  if (element.closest('[inert],[hidden],[aria-hidden="true"]') !== null) {
    return false;
  }

  // jsdom has no layout and no `checkVisibility`: there every attached control counts as shown.
  return (
    typeof element.checkVisibility !== 'function' ||
    element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  );
}

function isEnabled(element: HTMLElement): boolean {
  return !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true';
}

/** An open modal dialog owns the keyboard: a control behind it is not reachable by a click either. */
function isReachable(element: HTMLElement): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"],[role="alertdialog"]');

  return [...dialogs].every((dialog) => dialog.contains(element));
}

function findTarget(shortcut: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[aria-keyshortcuts]')].find(
    (element) =>
      element.getAttribute('aria-keyshortcuts')?.split(' ').includes(shortcut) === true &&
      isShown(element) &&
      isEnabled(element) &&
      isReachable(element)
  );
}

/**
 * Runs the shortcuts declared on screen with `aria-keyshortcuts`: a field gets
 * focus with its text selected, any other control a click. A shortcut without
 * a modifier is a typed character while focus is in a text field, and is left
 * to the field.
 */
export function useShortcuts() {
  useEffect(function runShortcuts() {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat) {
        return;
      }

      const shortcuts = toShortcuts(event);
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;

      if (plain && isTypingFocused()) {
        return;
      }

      const target = shortcuts.map(findTarget).find((element) => element !== undefined);

      if (target === undefined) {
        if (shortcuts.some((shortcut) => SWALLOWED.has(shortcut))) {
          event.preventDefault();
        }

        return;
      }

      event.preventDefault();

      if (target instanceof HTMLInputElement) {
        target.focus();
        target.select();
      } else {
        target.click();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return function stopShortcuts() {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

/** Apple keyboards name the command key, others the control key. */
export function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}
