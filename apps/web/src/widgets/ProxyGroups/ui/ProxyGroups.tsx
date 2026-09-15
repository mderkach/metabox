import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ProxyGroup, ProxyNode } from '@entities/Proxy';
import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardHeader } from '@shared/ui';

import { ProxyGroupCard } from './ProxyGroupCard';
import { ProxyNodeTile } from './ProxyNodeTile';

const NO_OP = () => undefined;

/**
 * Группы прокси, а когда их нет — список аутбаундов.
 *
 * Конфиг без групп — обычный случай, а не пустое состояние: правила ссылаются
 * прямо на аутбаунды, и переключать в рантайме нечего.
 */
export function ProxyGroups({ groups, nodes }: { groups: ProxyGroup[]; nodes: ProxyNode[] }) {
  const { t } = useTranslation('widgets/ProxyGroups');
  if (groups.length > 0) {
    return (
      <ul className='flex flex-col gap-3'>
        {groups.map((group) => (
          <li key={group.name}>
            <ProxyGroupCard group={group} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      <Alert>
        <Info />
        <AlertTitle>{t('empty.title')}</AlertTitle>
        <AlertDescription>{t('empty.description')}</AlertDescription>
      </Alert>

      <Card className='gap-0 overflow-hidden py-0'>
        <CardHeader className='flex flex-row items-center gap-2.5 border-b border-border px-4 py-3'>
          <h2 className='font-mono text-sm font-medium'>{t('empty.outbounds')}</h2>
          <p className='text-xs text-muted-foreground'>{nodes.length}</p>
        </CardHeader>
        <CardContent className='px-4 py-3'>
          <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
            {nodes.map((node) => (
              <ProxyNodeTile key={node.name} node={node} selectable={false} onSelect={NO_OP} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
