import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, type ComponentProps } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useRuleSetCatalog } from '@entities/RuleSet';
import {
  Button,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  QueryFailure,
} from '@shared/ui';

import { useRuleCatalogDraft } from '../model/RuleCatalogAdd.draft';
import { RuleCatalogFormSchema, searchCatalog, type RuleCatalogForm } from '../model/RuleCatalogAdd.form';
import { getCatalogResolvers, planCatalogService } from '../model/RuleCatalogAdd.plan';
import { RuleCatalogAddPreview } from './RuleCatalogAddPreview';
import { RuleCatalogAddSearch } from './RuleCatalogAddSearch';
import { RuleCatalogAddSelect } from './RuleCatalogAddSelect';

interface RuleCatalogAddDialogProps {
  text: string;
  outbounds: readonly { tag?: string; type: string }[];
  stagedTags: ReadonlySet<string>;
  initialOutbound?: string;
  initialService?: string;
  finalFocus: ComponentProps<typeof DialogContent>['finalFocus'];
  onAdded: () => void;
}

export function RuleCatalogAddDialog({
  text,
  outbounds,
  stagedTags,
  initialOutbound,
  initialService,
  finalFocus,
  onAdded,
}: RuleCatalogAddDialogProps) {
  const { t } = useTranslation('features/Rule/RuleCatalogAdd');
  const catalog = useRuleSetCatalog();
  const { coreVersion, stage, stale } = useRuleCatalogDraft(text);
  const outboundItems = useMemo(() => {
    const tags = new Set(outbounds.flatMap(({ tag }) => (tag !== undefined && tag !== '' ? [tag] : [])));
    return Array.from(tags, (value) => ({
      value,
      label: stagedTags.has(value) ? t('stagedOutbound', { tag: value }) : value,
    }));
  }, [outbounds, stagedTags, t]);
  const form = useForm<RuleCatalogForm>({
    defaultValues: {
      search: initialService ?? '',
      service: '',
      resolver: '',
      outbound:
        outboundItems.find(({ value }) => value === initialOutbound)?.value ??
        (outboundItems.length === 1 ? outboundItems[0].value : ''),
    },
    resolver: zodResolver(RuleCatalogFormSchema),
  });
  const [search, service, outbound, resolver] = useWatch({
    control: form.control,
    name: ['search', 'service', 'outbound', 'resolver'],
  });
  const choices = useMemo(() => searchCatalog(catalog.data, search), [catalog.data, search]);
  const selected = choices.find((choice) => choice.id === service) ?? choices.at(0);
  const resolvers = useMemo(() => getCatalogResolvers(text, outbound), [text, outbound]);
  const plan = useMemo(
    () =>
      selected !== undefined && outbound
        ? planCatalogService({
            text,
            coreVersion,
            list: selected.list,
            category: selected.category,
            outbound,
            resolver,
          })
        : undefined,
    [text, coreVersion, selected, outbound, resolver]
  );

  const submit = form.handleSubmit(() => {
    if (selected === undefined || plan?.ok !== true) return;
    if (stage({ list: selected.list, category: selected.category, outbound, resolver }, plan.text)) {
      onAdded();
    } else {
      form.setError('root', { type: 'stale' });
    }
  });

  return (
    <DialogContent
      finalFocus={finalFocus}
      showCloseButton={false}
      className='max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto overscroll-contain sm:max-w-lg'
    >
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <FormProvider {...form}>
        <form
          className='grid min-w-0 gap-3'
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          {catalog.isLoadingError ? (
            <QueryFailure messageKey='source.ruleSetCatalog' query={catalog} />
          ) : (
            <RuleCatalogAddSearch choices={choices} selected={selected} pending={catalog.isPending} />
          )}
          <div className='grid min-w-0 gap-3 sm:grid-cols-2'>
            <RuleCatalogAddSelect
              name='outbound'
              label={t('outbound')}
              placeholder={outboundItems.length ? t('selectOutbound') : t('noOutbounds')}
              items={outboundItems}
            />
            <div className='flex flex-col gap-1.5'>
              <span className='text-sm font-medium'>{t('scope')}</span>
              <span className='flex min-h-8 items-center text-sm'>{t('allDevices')}</span>
            </div>
          </div>
          {outbound && (
            <RuleCatalogAddSelect
              name='resolver'
              label={t('resolver')}
              placeholder={resolvers.length ? t('selectResolver') : t('noneCompatible')}
              inherited={plan?.ok === true ? plan.resolver : undefined}
              items={resolvers.map((tag) => ({ value: tag, label: tag }))}
            />
          )}
          {plan && <RuleCatalogAddPreview plan={plan} outbound={outbound} hasResolvers={resolvers.length > 0} />}
          {(stale || form.formState.errors.root) && (
            <p role='alert' className='text-sm text-destructive'>
              {t(stale ? 'changedOnDevice' : 'stale')}
            </p>
          )}
          <div className='flex flex-wrap justify-end gap-2 pt-1'>
            <DialogClose render={<Button variant='ghost' type='button' />}>{t('cancel')}</DialogClose>
            <Button type='submit' disabled={stale || plan?.ok !== true}>
              {plan?.ok === true && plan.text === text ? t('done') : t('submit')}
            </Button>
          </div>
        </form>
      </FormProvider>
    </DialogContent>
  );
}
