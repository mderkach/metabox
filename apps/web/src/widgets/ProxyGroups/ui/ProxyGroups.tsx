import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ProxyGroup, ProxyNode } from '@entities/Proxy';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SECTION_HEADING,
} from '@shared/ui';

import { ProxyGroupCard } from './ProxyGroupCard';
import { ProxyGroupsLegend } from './ProxyGroupsLegend';
import { ProxyNodeTile } from './ProxyNodeTile';

const NO_OP = () => undefined;

/**
 * Группы прокси, а когда их нет — список аутбаундов.
 *
 * Конфиг без групп — обычный случай, а не пустое состояние: правила ссылаются
 * прямо на аутбаунды, и переключать в рантайме нечего.
 */
export function ProxyGroups({
  groups,
  nodes,
  onSelected,
  onTested,
}: {
  groups: ProxyGroup[];
  nodes: ProxyNode[];
  /** Рантайм принял выбор узла: экран объявляет результат своей живой областью. */
  onSelected: (group: string, node: string) => void;
  /** Замер задержки группы прошёл. */
  onTested: (group: string) => void;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');
  if (groups.length > 0) {
    return (
      <div className='flex flex-col gap-3'>
        <ProxyGroupsLegend />
        <ul className='flex flex-col gap-3'>
          {groups.map((group) => (
            <li key={group.name}>
              <ProxyGroupCard group={group} onSelected={onSelected} onTested={onTested} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      <Alert>
        <Info />
        <AlertTitle>{t('empty.title')}</AlertTitle>
        <AlertDescription>{t('empty.description')}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader className='border-b'>
          <CardTitle className={SECTION_HEADING}>
            <h3>{t('empty.outbounds')}</h3>
          </CardTitle>
          <CardDescription>{nodes.length}</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <ProxyGroupsLegend />
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
