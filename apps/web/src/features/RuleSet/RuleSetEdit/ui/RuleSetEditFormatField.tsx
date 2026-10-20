import { useFormContext, useWatch } from 'react-hook-form';

import { FormatField } from '@features/RuleSet/RuleSetAdd/@x/RuleSetEdit';

import type { RuleSetEditModel } from '../model/RuleSetEdit.schema';

/** The add form format field reads the address as a string; without an address there is no format to pick. */
export function RuleSetEditFormatField() {
  const { control } = useFormContext<RuleSetEditModel>();
  const url = useWatch({ control, name: 'url' });

  return url === null ? null : <FormatField />;
}
