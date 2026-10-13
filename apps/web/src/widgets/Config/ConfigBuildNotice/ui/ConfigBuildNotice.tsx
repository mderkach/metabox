import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { findUnbuiltNodes, findUnbuiltOptions, type ConfigDocument, type UnbuiltNode } from '@entities/Config';
import { useDaemonStatus } from '@entities/Daemon';
import { Alert, AlertDescription, AlertTitle } from '@shared/ui';

/**
 * Nodes and options that the binary on the device will not start: they are not in its build.
 *
 * The panel does not forbid such a config — the draft is saved and edited — but
 * names the consequence: `sing-box check` will reject it, and apply will not
 * go through. The build composition is reported by the daemon; until it is read, there is nothing to
 * warn about, and there is no block.
 */
export function ConfigBuildNotice({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigBuildNotice');
  const status = useDaemonStatus();
  const tags = status.data?.singboxTags ?? null;
  const nodes = findUnbuiltNodes(config, tags);
  const options = findUnbuiltOptions(config, tags);

  if (nodes.length + options.length === 0) {
    return null;
  }

  return (
    <Alert variant='destructive'>
      <TriangleAlert />
      <AlertTitle>{t('title', { count: nodes.length + options.length })}</AlertTitle>
      <AlertDescription>
        <p>{t('description')}</p>
        <ul className='mt-1 flex flex-col gap-0.5'>
          {nodes.map((node) => (
            <li key={`${node.section}.${String(node.index)}`} className='font-mono text-xs'>
              {t('node', { name: toNodeName(node), type: node.type, tag: node.buildTag })}
            </li>
          ))}
          {options.map((option) => (
            <li key={option.path} className='font-mono text-xs'>
              {t('option', { path: option.path, tag: option.buildTag })}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function toNodeName(node: UnbuiltNode): string {
  return node.tag ?? `${node.section}[${String(node.index)}]`;
}
