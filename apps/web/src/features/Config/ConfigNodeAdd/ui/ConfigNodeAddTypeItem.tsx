import { useTranslation } from 'react-i18next';

import { Badge, SelectItem } from '@shared/ui';

import type { NodeTypeOption } from '../model/ConfigNodeAdd.model';

/** Type in the choice list: the name, what the type does, and a mark when the binary is built without it. */
export function ConfigNodeAddTypeItem({ option }: { option: NodeTypeOption }) {
  const { t } = useTranslation('features/Config/ConfigNodeAdd');

  return (
    <SelectItem value={option.type} className='items-start'>
      <span className='flex min-w-0 flex-col gap-0.5'>
        <span className='flex flex-wrap items-center gap-2'>
          <span className='font-mono'>{option.type}</span>
          {option.unbuilt !== null && <Badge variant='outline'>{t('unbuilt.badge')}</Badge>}
        </span>
        {option.described !== null && (
          <span className='text-xs whitespace-normal text-muted-foreground'>
            {t(`description.${option.described}`)}
          </span>
        )}
      </span>
    </SelectItem>
  );
}
