import i18next from 'i18next';
import type { z } from 'zod';

export interface UnknownField {
  /** Node path as an edit addresses it: `route.rules.0`. Empty means the root. */
  path: string;
  fields: string[];
}

function joinPath(prefix: string, path: PropertyKey[]): string {
  return [prefix, ...path.map(String)].filter((part) => part !== '').join('.');
}

/**
 * Nodes that lacked only fields the schema does not know. `null` means
 * there is a real error among the remarks: a wrong type, a missing field.
 *
 * Schemas are strict, so an extra field is a remark, not silence. But the schema
 * is built from a release build of the fork and knows less than the binary: a node with an
 * unfamiliar field is marked by the panel and edited as text, not declared an error.
 *
 * A union is unfolded: a rule is described by variants, and an extra key comes not as
 * a refusal on the key but as `invalid_union` with the remarks of each branch. A node
 * counts as merely unfamiliar if in at least one branch only
 * extra fields got in the way — so by its other fields it fits the schema.
 */
export function toUnknownFields(issues: readonly z.core.$ZodIssue[], prefix = ''): UnknownField[] | null {
  const fields: UnknownField[] = [];

  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      fields.push({ path: joinPath(prefix, issue.path), fields: issue.keys });

      continue;
    }

    if (issue.code !== 'invalid_union') {
      return null;
    }

    const branch = issue.errors
      .map((errors) => toUnknownFields(errors, joinPath(prefix, issue.path)))
      .find((collected) => collected !== null);

    if (branch === undefined) {
      return null;
    }

    fields.push(...branch);
  }

  return fields;
}

/** Schema remarks as human-readable text: the node path and what is wrong with it. */
export function describeIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  const unknown = toUnknownFields(issues);

  if (unknown !== null) {
    return unknown.map((item) => {
      const fields = item.fields.join(', ');

      return item.path === ''
        ? i18next.t('schema.unknownFields', { ns: 'shared', fields })
        : i18next.t('schema.unknownFieldsAt', { ns: 'shared', path: item.path, fields });
    });
  }

  return issues.map((issue) =>
    i18next.t('schema.issue', { ns: 'shared', path: issue.path.join('.'), message: issue.message })
  );
}
