import type { JSONPath } from 'jsonc-parser';

/** Edit of one document leaf; `value: undefined` deletes the key. */
export interface NodeEdit {
  path: JSONPath;
  value: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The value as it will go into the document: `null`, an empty string, an empty
 * list and an empty object mean "no key", and an object drops its empty keys.
 * The form keeps a cleared field empty (React Hook Form reads `undefined` as
 * "take the default value"), while the draft does not add fields. `undefined`
 * means there is no key in the document itself either.
 */
export function compactNode(value: unknown): unknown {
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return undefined;
  }

  if (!isRecord(value)) {
    return value;
  }

  const entries = Object.entries(value).flatMap(([key, item]) => {
    const next = compactNode(item);

    return next === undefined ? [] : [[key, next] as const];
  });

  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function isEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => isEqual(item, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);

    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && isEqual(left[key], right[key]))
    );
  }

  return false;
}

/**
 * Edits that turn node `before` into `after`: only the changed leaves.
 *
 * Objects are compared by keys, everything else is a whole leaf: a scalar, an
 * array, a value in place of an object. This way editing one form field gives
 * one diff line, while comments and key order inside the node stay as they
 * were, whereas writing the whole node would rewrite all of it (ADR-0004).
 *
 * `base` is the node path in the document, leaf keys are appended to it. Empty
 * values are the same as in `compactNode`: a cleared field deletes the key.
 */
export function diffNode(base: JSONPath, before: unknown, after: unknown): NodeEdit[] {
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    return [...keys].flatMap((key) => diffNode([...base, key], before[key], after[key]));
  }

  const next = compactNode(after);

  if (compactNode(before) === undefined && next === undefined) {
    return [];
  }

  return isEqual(before, next) ? [] : [{ path: base, value: next }];
}
