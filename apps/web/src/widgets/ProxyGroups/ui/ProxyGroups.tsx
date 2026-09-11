import { Info } from 'lucide-react';

import type { ProxyGroup, ProxyNode } from '@entities/Proxy';
import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardHeader } from '@shared/ui';

import { ProxyGroupCard } from './ProxyGroupCard';
import { ProxyNodeRow } from './ProxyNodeRow';

const NO_OP = () => undefined;

/**
 * Группы прокси, а когда их нет — список аутбаундов.
 *
 * Конфиг без групп — обычный случай, а не пустое состояние: правила ссылаются
 * прямо на аутбаунды, и переключать в рантайме нечего.
 */
export function ProxyGroups({ groups, nodes }: { groups: ProxyGroup[]; nodes: ProxyNode[] }) {
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
        <AlertTitle>Групп в конфиге нет — это рабочий вариант</AlertTitle>
        <AlertDescription>
          Правила указывают прямо на аутбаунды, поэтому активный выход задаёт правило маршрутизации, а не выбор здесь.
          Чтобы переключать выход на лету, в конфиге нужна группа-селектор.
        </AlertDescription>
      </Alert>

      <Card className='gap-0 overflow-hidden py-0'>
        <CardHeader className='flex flex-row items-center gap-2.5 border-b border-border px-4 py-3'>
          <h2 className='text-sm font-medium'>Аутбаунды конфига</h2>
          <p className='text-xs text-muted-foreground'>{nodes.length}</p>
        </CardHeader>
        <CardContent className='px-0'>
          <ul>
            {nodes.map((node) => (
              <ProxyNodeRow key={node.name} node={node} selectable={false} onSelect={NO_OP} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
