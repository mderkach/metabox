import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import type { RuleRow } from '@entities/Rule';
import { t } from '@shared/lib/i18n';
import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { RULE_ACTION, RuleEditAdapterSchema, type RuleEditModel, type RuleEditPatch } from '../model/RuleEdit.schema';

const ACTION_LABEL: Readonly<Record<string, string>> = {
  [RULE_ACTION.Route]: 'отправить в outbound',
  [RULE_ACTION.Reject]: 'оборвать',
  [RULE_ACTION.HijackDns]: 'перехватить DNS',
  [RULE_ACTION.Sniff]: 'определить протокол',
};

/**
 * Исход правила: что делать с трафиком и куда его отправить.
 *
 * Правка ложится на текст файла по пути узла (ADR-0004): меняется одна строка,
 * порядок ключей и незнакомые узлы остаются как были.
 */
export function RuleEditForm({ rule, outbounds }: { rule: RuleRow; outbounds: string[] }) {
  const edit = ConfigDocumentState.use.edit();

  const form = useForm<RuleEditModel, unknown, RuleEditPatch>({
    // Значения берутся из узла как есть: дефолт, дописанный формой, попал бы
    // в диф правкой, которой пользователь не делал (AC-2).
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
    // которой пользователь не делал (AC-2).
    if (touched.action === true) {
      edit([...path, 'action'], patch.action);
    }

    if (touched.outbound === true || touched.action === true) {
      edit([...path, 'outbound'], 'outbound' in patch ? patch.outbound : undefined);
    }
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
          Применить к черновику
        </Button>
      </form>
    </FormProvider>
  );
}

function ActionField() {
  const { control } = useFormContext<RuleEditModel>();

  return (
    <Controller
      control={control}
      name='action'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='rule-action'>Что делать</Label>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id='rule-action'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(RULE_ACTION).map((action) => (
                <SelectItem key={action} value={action}>
                  {ACTION_LABEL[action]}
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
          <Label htmlFor='rule-outbound'>Куда отправить</Label>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id='rule-outbound'>
              <SelectValue placeholder='выберите outbound' />
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
              {t(fieldState.error.message ?? '')}
            </p>
          )}
        </div>
      )}
    />
  );
}

function isKnownAction(target: string, kind: RuleRow['targetKind']): target is RuleEditModel['action'] {
  return kind === 'action' && Object.values(RULE_ACTION).some((action) => action === target);
}
