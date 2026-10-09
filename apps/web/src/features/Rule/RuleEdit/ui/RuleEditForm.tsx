import { zodResolver } from '@hookform/resolvers/zod';
import type { ParseKeys, TFunction } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, ruleNodePath } from '@entities/Config';
import { RULE_SET_MATCHER, ruleSetsOf, type RuleRow } from '@entities/Rule';
import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import {
  conditionLines,
  RULE_ACTION,
  RULE_CONDITIONS,
  RULE_EDIT_ERROR,
  RuleEditAdapterSchema,
  type RuleCondition,
  type RuleEditModel,
  type RuleEditPatch,
} from '../model/RuleEdit.schema';
import { RuleConditionFields } from './RuleConditionFields';

const ERROR_KEY: Readonly<Record<string, ParseKeys<'features/Rule/RuleEdit'> | undefined>> = {
  [RULE_EDIT_ERROR.OutboundRequired]: 'error.outboundRequired',
};

/**
 * Выход правила — что делать с трафиком и куда его отправить, — сеты, на
 * которые оно ссылается, и ходовые условия.
 *
 * Правка ложится на текст файла по пути узла: меняется одна строка,
 * порядок ключей и незнакомые узлы остаются как были.
 *
 * `ruleSets` — теги наборов документа. Логическое правило не получает ни
 * сетов, ни условий: у его ветки схемы их нет, они живут во вложенных правилах.
 */
export function RuleEditForm({
  rule,
  outbounds,
  ruleSets,
}: {
  rule: RuleRow;
  outbounds: string[];
  ruleSets: string[];
}) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const edit = ConfigDocumentState.use.edit();
  const initialSets = ruleSetsOf(rule);
  const initialConditions = conditionTexts(rule);
  const onlyEditable = hasOnlyEditableConditions(rule);

  const form = useForm<RuleEditModel, unknown, RuleEditPatch>({
    // Значения берутся из узла как есть: дефолт, дописанный формой, попал бы
    // в диф правкой, которой пользователь не делал.
    defaultValues: {
      action: isKnownAction(rule.target, rule.targetKind) ? rule.target : RULE_ACTION.Route,
      outbound: rule.targetKind === 'outbound' ? rule.target : '',
      // Строка `"rule_set": "x"` приходит списком; пока поле не тронуто,
      // узел не переписывается и строка остаётся строкой.
      ruleSet: initialSets,
      conditions: initialConditions,
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

    // Сеты сравниваются множествами, а не `dirtyFields`: у массива RHF отдаёт
    // флаги по элементам, а снятый и снова выбранный сет меняет только порядок.
    if (!sameTags(form.getValues('ruleSet'), form.formState.defaultValues?.ruleSet ?? [])) {
      edit([...path, RULE_SET_MATCHER], 'rule_set' in patch ? patch.rule_set : undefined);
    }

    // Условие сравнивается по строкам: лишний пробел или пустая строка правкой
    // не считаются и в диф не попадают.
    for (const key of RULE_CONDITIONS) {
      const before = conditionLines(form.formState.defaultValues?.conditions?.[key] ?? '');

      if (!sameLines(conditionLines(form.getValues(`conditions.${key}`)), before)) {
        edit([...path, key], patch.conditions[key]);
      }
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
        {rule.group === null && <RuleSetField ruleSets={ruleSets} initial={initialSets} />}
        {rule.group === null && (
          <RuleConditionFields initial={RULE_CONDITIONS.filter((key) => initialConditions[key].length > 0)} />
        )}
        {rule.group === null && onlyEditable && <CatchAllWarning />}

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

/**
 * Сеты правила. Опции — наборы документа и сеты самого правила: тег, которого
 * в документе нет, остаётся выбранным и помечается, а не пропадает молча, —
 * запрещать запись может только `sing-box check`.
 */
function RuleSetField({ ruleSets, initial }: { ruleSets: string[]; initial: string[] }) {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { control, watch } = useFormContext<RuleEditModel>();
  const value = watch('ruleSet');
  const known = new Set(ruleSets);
  const options = [...new Set([...ruleSets, ...initial, ...value])];

  return (
    <Controller
      control={control}
      name='ruleSet'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='rule-rule-set'>{t('field.ruleSet.label')}</Label>
          <Select multiple value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id='rule-rule-set' className='w-full'>
              {/* В режиме `multiple` значение — список: подпись собирается
                  функцией, `placeholder` её не заменит. */}
              <SelectValue className='min-w-0'>
                {(tags: readonly string[]) => (
                  <span className='truncate'>{tags.length > 0 ? tags.join(', ') : t('field.ruleSet.empty')}</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                  {!known.has(tag) && <span className='text-muted-foreground'>{t('field.ruleSet.missing')}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}

/**
 * Правило без условий заберёт весь трафик, и правила ниже не сработают.
 * Предупреждение не блокирует запись: такое правило бывает и намеренно.
 */
function CatchAllWarning() {
  const { t } = useTranslation('features/Rule/RuleEdit');
  const { watch } = useFormContext<RuleEditModel>();
  const sets = watch('ruleSet');
  const conditions = watch('conditions');
  const empty = sets.length === 0 && RULE_CONDITIONS.every((key) => conditionLines(conditions[key]).length === 0);

  if (!empty) {
    return null;
  }

  return (
    <p role='status' className='flex items-start gap-1.5 text-xs text-pretty text-signal-warn'>
      <TriangleAlert className='mt-px size-3.5 shrink-0' aria-hidden='true' />
      <span>{t('warning.catchAll')}</span>
    </p>
  );
}

/**
 * Все условия правила правятся формой, и хотя бы одно задано: сняв их,
 * пользователь получит правило без условий. Флаги `rule_set_ip_cidr_*`
 * начинаются с имени сетов и условием не считаются: без сетов им нечего
 * уточнять.
 */
function hasOnlyEditableConditions(rule: RuleRow): boolean {
  return (
    rule.matchers.length > 0 &&
    rule.matchers.every(
      (matcher) =>
        matcher.key.startsWith(RULE_SET_MATCHER) || RULE_CONDITIONS.some((condition) => condition === matcher.key)
    )
  );
}

function conditionTexts(rule: RuleRow): Record<RuleCondition, string> {
  const text = (key: RuleCondition) => rule.matchers.find((matcher) => matcher.key === key)?.values.join('\n') ?? '';

  return {
    domain: text('domain'),
    domain_suffix: text('domain_suffix'),
    domain_keyword: text('domain_keyword'),
    ip_cidr: text('ip_cidr'),
    port: text('port'),
  };
}

function sameLines(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}

/** Одинаковы ли наборы тегов без учёта порядка. */
function sameTags(left: readonly (string | undefined)[], right: readonly (string | undefined)[]): boolean {
  const tags = new Set(left);

  return tags.size === new Set(right).size && right.every((tag) => tags.has(tag));
}

/** Код отказа из схемы в текст: сообщение приходит строкой, ключи — свои. */
function errorText(t: TFunction<'features/Rule/RuleEdit'>, message: string | undefined): string | null {
  const key = message === undefined ? undefined : ERROR_KEY[message];

  return key === undefined ? null : t(key);
}

function isKnownAction(target: string, kind: RuleRow['targetKind']): target is RuleEditModel['action'] {
  return kind === 'action' && Object.values(RULE_ACTION).some((action) => action === target);
}
