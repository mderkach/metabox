import type { ReactNode } from 'react';

import { RULE_SET_FIELD, type RuleSetCellProps, type RuleSetField } from './RuleSetColumns';
import { RuleSetSizeCell } from './RuleSetSizeCell';
import { RuleSetSourceCell } from './RuleSetSourceCell';
import { RuleSetTagCell } from './RuleSetTagCell';
import { RuleSetUpdatedCell } from './RuleSetUpdatedCell';
import { RuleSetUsageCell } from './RuleSetUsageCell';

/** Cell by column name: a new column is added by an entry here and a definition in `RuleSetColumns`. */
export const CELL: Readonly<Record<RuleSetField, (props: RuleSetCellProps) => ReactNode>> = {
  [RULE_SET_FIELD.Tag]: RuleSetTagCell,
  [RULE_SET_FIELD.Source]: RuleSetSourceCell,
  [RULE_SET_FIELD.Updated]: RuleSetUpdatedCell,
  [RULE_SET_FIELD.Size]: RuleSetSizeCell,
  [RULE_SET_FIELD.Usage]: RuleSetUsageCell,
};
