import type { ComponentType } from 'react';

import { FIELD_KIND, type FieldKind } from '@shared/lib/schemaShape';

import {
  BooleanField,
  DurationField,
  EnumField,
  EnumListField,
  GroupField,
  ListField,
  NumberField,
  RawField,
  ScalarField,
  StringField,
  type NodeFieldProps,
} from './ConfigNodeFormFields';

/**
 * Field kind to widget. A new kind is added by an entry, not an `if` branch;
 * `null` means the field is not drawn: the node `type` changes only by a new
 * node.
 */
export const CONFIG_NODE_FORM_WIDGET: Readonly<Record<FieldKind, ComponentType<NodeFieldProps> | null>> = {
  [FIELD_KIND.String]: StringField,
  [FIELD_KIND.Duration]: DurationField,
  [FIELD_KIND.Int]: NumberField,
  [FIELD_KIND.Number]: NumberField,
  [FIELD_KIND.Boolean]: BooleanField,
  [FIELD_KIND.Enum]: EnumField,
  [FIELD_KIND.Literal]: null,
  [FIELD_KIND.List]: ListField,
  [FIELD_KIND.EnumList]: EnumListField,
  [FIELD_KIND.Scalar]: ScalarField,
  [FIELD_KIND.Group]: GroupField,
  [FIELD_KIND.Raw]: RawField,
};
