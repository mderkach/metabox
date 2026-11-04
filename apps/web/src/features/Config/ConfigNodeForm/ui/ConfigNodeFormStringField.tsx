import { use } from 'react';

import { secretMaskOf } from '../model';
import { NodeRegistryContext } from './ConfigNodeForm.context';
import type { NodeFieldProps } from './ConfigNodeForm.field';
import { ConfigNodeFormSecretField } from './ConfigNodeFormSecretField';
import { ConfigNodeFormTextField } from './ConfigNodeFormTextField';

export function ConfigNodeFormStringField({ field, name, children }: NodeFieldProps) {
  const registry = use(NodeRegistryContext);
  const mask = secretMaskOf(field.path, registry);

  return mask === null ? (
    <ConfigNodeFormTextField field={field} name={name}>
      {children}
    </ConfigNodeFormTextField>
  ) : (
    <ConfigNodeFormSecretField field={field} name={name} mask={mask}>
      {children}
    </ConfigNodeFormSecretField>
  );
}
