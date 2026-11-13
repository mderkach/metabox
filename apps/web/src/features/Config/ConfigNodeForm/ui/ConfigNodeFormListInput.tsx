import { TokenInput } from '@shared/ui';

import { packList, unpackList } from '../model';

/**
 * A list value can hold a space or a comma (a header, a PEM line), so only a
 * line break closes it, and a repeat is kept: a certificate chain repeats its
 * BEGIN and END lines.
 */
const LINE_BREAK = /\r?\n/;

export function ConfigNodeFormListInput({
  id,
  label,
  value,
  listable,
  invalid,
  describedBy,
  onBlur,
  onValue,
}: {
  id: string;
  label: string;
  value: unknown;
  /** A single value is written as a string, not as an array of one. */
  listable: boolean;
  invalid: boolean;
  describedBy: string;
  onBlur: () => void;
  onValue: (value: unknown) => void;
}) {
  return (
    <TokenInput
      id={id}
      label={label}
      value={unpackList(value)}
      separator={LINE_BREAK}
      distinct={false}
      spellCheck={false}
      autoCapitalize='off'
      autoComplete='off'
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onBlur={onBlur}
      onValueChange={(items) => {
        onValue(packList(items, listable));
      }}
    />
  );
}
