import { useTranslation } from 'react-i18next';

import type { NewRulePlace, RuleRow } from '@entities/Rule';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui';

import { EditorRuleAdd } from './EditorRuleAdd';

/** The config is read but has no rules: this is a config state, not a loading state. */
export function EditorNoRules({
  rules,
  total,
  finalOutbound,
  onAdd,
}: {
  rules: readonly RuleRow[];
  total: number;
  finalOutbound: string | null;
  onAdd: (place: NewRulePlace) => void;
}) {
  const { t } = useTranslation('pages/Editor');

  return (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyTitle>{t('empty.title')}</EmptyTitle>
        <EmptyDescription>{t('empty.description')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <EditorRuleAdd rules={rules} total={total} finalOutbound={finalOutbound} onAdd={onAdd} />
      </EmptyContent>
    </Empty>
  );
}
