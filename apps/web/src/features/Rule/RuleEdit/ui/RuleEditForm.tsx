import { zodResolver } from '@hookform/resolvers/zod';
import type { ParseKeys, TFunction } from 'i18next';
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import type { RuleRow } from '@entities/Rule';
import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import {
  RULE_ACTION,
  RULE_EDIT_ERROR,
  RuleEditAdapterSchema,
  type RuleEditModel,
  type RuleEditPatch,
} from '../model/RuleEdit.schema';

const ERROR_KEY: Readonly<Record<string, ParseKeys<'features/Rule/RuleEdit'> | undefined>> = {
  [RULE_EDIT_ERROR.OutboundRequired]: 'error.outboundRequired',
};

/**
 * Выход правила: что делать с трафиком и куда его отправить.
 *
 * Правка ложится на текст файла по пути узла (ADR-0004): меняется одна строка,
 * порядок ключей и незнакомые узлы остаются как были.
 */
export function RuleEditForm({ rule, outbounds }: { rule: RuleRow; outbounds: string[] }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const edit = ConfigDocumentState.use.edit();

  const form = useForm<RuleEditModel, unknown, RuleEditPatch>({
    // Значения берутся из узла как есть: дефолт, дописанный формой, попал бы
    // в диф правкой, которой пользователь не делал.
    defaultValues: {
      action: isKnownAction(rule.target, rule.targetKind) ? rule.target : RULE_ACTION.Route,
      outbound: rule.targetKind === 'outbound' ? rule.target : '',
    },
    mode: 'onChange',
    resolver: zodResolver(RuleEditAdapterSchema),
  });

  const onSubmit = form.handleSubmit((patch) => {
    const path = ruleNodePath(rule.index);
    const touched = form.formState.dirtyFields;

    // Пишутся только тронутые поля. Правило без ключа `action` — обычное дело
    // (`route` подразумевается), и дописанный ключ попал бы в диф правкой,
    // которой пользователь не делал.
    if (touched.action === true) {
      edit([...path, 'action'], patch.action);
    }

    if (touched.outbound === true || touched.action === true) {
      edit([...path, 'outbound'], 'outbound' in patch ? patch.outbound : undefined);
    }

    // Сохранённое становится новой точкой отсчёта: кнопка гаснет, пока форма
    // снова не разойдётся с черновиком.
    form.reset(form.getValues());
  });

  return (
    <FormProvider {...form}>
      <form
        className='flex flex-col gap-3'
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <ActionField />
        <OutboundField outbounds={outbounds} />

        <Button type='submit' size='sm' disabled={!form.formState.isDirty}>
          {t('submit')}
        </Button>
      </form>
    </FormProvider>
  );
}

function ActionField() {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control } = useFormContext<RuleEditModel>();

  return (
    <Controller
      control={control}
      name='action'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='rule-action'>{t('field.action.label')}</Label>
          <Select
            items={Object.values(RULE_ACTION).map((action) => ({ value: action, label: t(`action.${action}`) }))}
            value={field.value}
            onValueChange={field.onChange}
          >
            <SelectTrigger id='rule-action'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(RULE_ACTION).map((action) => (
                <SelectItem key={action} value={action}>
                  {t(`action.${action}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}

function OutboundField({ outbounds }: { outbounds: string[] }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control, watch } = useFormContext<RuleEditModel>();
  const action = watch('action');

  if (action !== RULE_ACTION.Route) {
    return null;
  }

  return (
    <Controller
      control={control}
      name='outbound'
      render={({ field, fieldState }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='rule-outbound'>{t('field.outbound.label')}</Label>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id='rule-outbound'>
              <SelectValue placeholder={t('field.outbound.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {outbounds.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldState.error !== undefined && (
            <p role='alert' className='text-xs text-destructive'>
              {errorText(t, fieldState.error.message)}
            </p>
          )}
        </div>
      )}
    />
  );
}

/** Код отказа из схемы в текст: сообщение приходит строкой, ключи — свои. */
function errorText(t: TFunction<'features/Rule/RuleEdit'>, message: string | undefined): string | null {
  const key = message === undefined ? undefined : ERROR_KEY[message];

  return key === undefined ? null : t(key);
}

function isKnownAction(target: string, kind: RuleRow['targetKind']): target is RuleEditModel['action'] {
  return kind === 'action' && Object.values(RULE_ACTION).some((action) => action === target);
}
