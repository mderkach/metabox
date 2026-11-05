import { type ReactNode } from 'react';

import type { FieldPlan } from '@shared/lib/schemaShape';

/** Field widget props: the field plan from the schema and the form field name. */
export interface NodeFieldProps {
  field: FieldPlan;
  /** Field path from the node root, dotted. */
  name: string;
  /** Group fields already assembled by the renderer. */
  children?: ReactNode;
}
