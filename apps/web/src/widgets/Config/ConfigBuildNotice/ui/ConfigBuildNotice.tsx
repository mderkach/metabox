import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { findUnbuiltNodes, type ConfigDocument, type UnbuiltNode } from '@entities/Config';
import { useDaemonStatus } from '@entities/Daemon';
import { Alert, AlertDescription, AlertTitle } from '@shared/ui';

/**
 * Узлы, которые бинарь на устройстве не запустит: их типа нет в его сборке.
 *
 * Панель такой конфиг не запрещает — черновик сохраняется и правится, — но
 * называет последствие: `sing-box check` его отвергнет, и применение не
 * пройдёт. Состав сборки сообщает демон; пока он не прочитан, предупреждать не
 * о чем, и блока нет.
 */
export function ConfigBuildNotice({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation('widgets/Config/ConfigBuildNotice');
  const status = useDaemonStatus();
  const nodes = findUnbuiltNodes(config, status.data?.singboxTags ?? null);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Alert variant='destructive'>
      <TriangleAlert />
      <AlertTitle>{t('title', { count: nodes.length })}</AlertTitle>
      <AlertDescription>
        <p>{t('description')}</p>
        <ul className='mt-1 flex flex-col gap-0.5'>
          {nodes.map((node) => (
            <li key={`${node.section}.${String(node.index)}`} className='font-mono text-xs'>
              {t('node', { name: toNodeName(node), type: node.type, tag: node.buildTag })}
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
