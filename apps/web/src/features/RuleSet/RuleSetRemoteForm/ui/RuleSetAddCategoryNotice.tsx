import { TriangleAlert } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { isCatalogCategory, type RuleSetList } from '@entities/RuleSet';

import { RULE_SET_REMOTE_FORM_NS } from '../i18n/RuleSetRemoteForm.namespace.generated';
import { type RuleSetRemoteFormModel } from '../model/RuleSetRemoteForm.schema';

/**
 * Category outside the listing. Not a failure: the provider may have added it
 * after the check. The warning names the consequence, because the panel cannot
 * check the address; the binary will do it on apply.
 */
export function RuleSetAddCategoryNotice({ list }: { list: RuleSetList | null }) {
  const { t } = useTranslation(RULE_SET_REMOTE_FORM_NS);
  const { control } = useFormContext<RuleSetRemoteFormModel>();
  const category = useWatch({ control, name: 'category' }).trim();

  if (list === null || category === '' || isCatalogCategory(list, category)) {
    return null;
  }

  return (
    <p role='status' className='flex items-start gap-1.5 text-xs text-pretty text-signal-warn'>
      <TriangleAlert className='mt-px size-3.5 shrink-0' aria-hidden='true' />
      <span>{t('field.category.offCatalog')}</span>
    </p>
  );
}
