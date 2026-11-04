import { unbuiltOptionOf } from '@entities/Config';
import { type FieldPlan } from '@shared/lib/schemaShape';

import { toFieldName } from '../model';
import { CONFIG_NODE_FORM_WIDGET } from './ConfigNodeForm.widgets';
import { ConfigNodeFormBuildOption } from './ConfigNodeFormBuildOption';

/**
 * Field by its kind: a widget from the table, a group with its own fields
 * inside. An option outside the binary build is marked once, at the topmost
 * field it belongs to; fields inside a marked group do not repeat the mark.
 */
export function ConfigNodeFormNodeField({
  field,
  builtTags,
  marked = false,
}: {
  field: FieldPlan;
  builtTags: readonly string[] | null;
  /** The field ancestor is already marked. */
  marked?: boolean;
}) {
  const Widget = CONFIG_NODE_FORM_WIDGET[field.kind];
  const name = toFieldName(field.path);
  const unbuilt = marked ? null : unbuiltOptionOf(name, builtTags);

  if (Widget === null) {
    return null;
  }

  return (
    <ConfigNodeFormBuildOption tag={unbuilt}>
      <Widget field={field} name={name}>
        {field.children?.map((child) => (
          <ConfigNodeFormNodeField
            key={child.key}
            field={child}
            builtTags={builtTags}
            marked={marked || unbuilt !== null}
          />
        ))}
      </Widget>
    </ConfigNodeFormBuildOption>
  );
}
