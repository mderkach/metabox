import { useTranslation } from 'react-i18next';

import { useListChanges } from '@entities/Config';

/**
 * List files that will go with this apply. Their content does not get into the
 * line-by-line diff, since the file is visible on the sets screen, but the
 * dialog must name the composition of changes: not only the config text is
 * applied.
 */
export function ConfigApplyListChanges() {
  const { t } = useTranslation('features/Config/ConfigApply');
  const lists = useListChanges();
  const put = Object.keys(lists.put);

  if (put.length + lists.remove.length === 0) {
    return null;
  }

  return (
    <section className='flex flex-col gap-1 text-sm'>
      <h3 className='font-medium'>{t('lists.title', { count: put.length + lists.remove.length })}</h3>
      <ul className='flex flex-col gap-0.5 font-mono text-xs'>
        {put.map((name) => (
          <li key={name}>rule-sets/{name}</li>
        ))}
        {lists.remove.map((name) => (
          <li key={name} className='text-destructive'>
            rule-sets/{name} — {t('lists.removed')}
          </li>
        ))}
      </ul>
    </section>
  );
}
