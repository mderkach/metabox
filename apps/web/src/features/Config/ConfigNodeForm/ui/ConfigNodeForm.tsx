import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';

import { nodeSchemaOf, type NodeRegistry } from '@entities/Config';

import { nodeOverrideOf, type ConfigNodeFormModel } from '../model';
import { NodeRegistryContext } from './ConfigNodeForm.context';
import { ConfigNodeFormBody } from './ConfigNodeFormBody';

/** Schema-driven node form with lossless leaf writes and optional type overrides (ADR-0035). */
export function ConfigNodeForm({
  registry,
  path,
  node,
  builtTags = null,
}: {
  registry: NodeRegistry;
  path: JSONPath;
  node: ConfigNodeFormModel;
  builtTags?: readonly string[] | null;
}) {
  const type = node.type;
  const schema = useMemo(() => (typeof type === 'string' ? nodeSchemaOf(registry, type) : null), [registry, type]);
  const override = typeof type === 'string' ? nodeOverrideOf(registry, type) : null;

  if (schema === null) {
    return null;
  }

  return (
    <NodeRegistryContext value={registry}>
      <ConfigNodeFormBody schema={schema} override={override} path={path} node={node} builtTags={builtTags} />
    </NodeRegistryContext>
  );
}
