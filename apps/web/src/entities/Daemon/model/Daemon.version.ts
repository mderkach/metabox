import { SCHEMA_FORK_VERSION } from '@shared/api/generated';

/**
 * Fork version the panel forms are built from, without the leading `v`: the
 * binary prints the version without it, while the fork tag has it.
 */
export const SCHEMA_VERSION = SCHEMA_FORK_VERSION.replace(/^v/, '');

/** How the binary on the device relates to the form schema. */
export const SCHEMA_DRIFT = {
  None: 'none',
  /** The binary is newer: its version's fields are not in the forms. */
  Newer: 'newer',
  /** The binary is older: it may not know a field from the forms and reject it on check. */
  Older: 'older',
} as const;

export type SchemaDrift = (typeof SCHEMA_DRIFT)[keyof typeof SCHEMA_DRIFT];

/**
 * Compares the binary version with the schema by numbers in order: the fork
 * version `1.14.1-extended-2.7.2` carries both the upstream version and the
 * fork version.
 *
 * An unknown version is not a mismatch: there is nothing to warn about.
 */
export function schemaDrift(singboxVersion: string | undefined): SchemaDrift {
  if (singboxVersion === undefined || singboxVersion === '') {
    return SCHEMA_DRIFT.None;
  }

  const binary = versionNumbers(singboxVersion);
  const schema = versionNumbers(SCHEMA_VERSION);

  for (let i = 0; i < Math.max(binary.length, schema.length); i++) {
    const delta = (binary[i] ?? 0) - (schema[i] ?? 0);

    if (delta !== 0) {
      return delta > 0 ? SCHEMA_DRIFT.Newer : SCHEMA_DRIFT.Older;
    }
  }

  return SCHEMA_DRIFT.None;
}

function versionNumbers(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map(Number);
}
