import { zodResolver } from '@hookform/resolvers/zod';
import type { ParseKeys, TFunction } from 'i18next';
import type { JSONPath } from 'jsonc-parser';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, findValue, ruleNodePath } from '@entities/Config';
import { RULE_SET_MATCHER, ruleSetsOf, toRuleRowsFromNodes, type RuleRow } from '@entities/Rule';
import { isTextEntryFocused } from '@shared/lib/focus';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

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
 * The rule outbound, what to do with traffic and where to send it, the sets it
 * refers to, and common conditions.
 *
 * A valid change goes into the draft at once, there is no save step: an edit
 * that only lives in the form would be lost on closing the panel and left out
 * of Apply. The edit goes onto the file text by the node path:
 * one line changes, key order and unfamiliar nodes stay as they were.
 *
 * `ruleSets` are document set tags. A logical rule gets neither sets nor
 * conditions: its schema branch has none, they live in nested rules.
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
  const edit = ConfigDocumentState.use.edit();
  const initialSets = ruleSetsOf(rule);
  const initialConditions = conditionTexts(rule);
  const onlyEditable = hasOnlyEditableConditions(rule);
  const values = useMemo(() => toFormValues(rule), [rule]);

  const form = useForm<RuleEditModel, unknown, RuleEditPatch>({
    // Values are taken from the node as is: a default appended by the form
    // would get into the diff as an edit the user did not make. `values` pulls
    // in an edit of the same node made as text, `keepDirtyValues` does not
    // erase what is being typed.
    defaultValues: values,
    values,
    resetOptions: { keepDirtyValues: true },
    mode: 'onChange',
    // A write follows every keystroke: focus must stay in the field being
    // typed, not jump to another field with an error.
    shouldFocusError: false,
    resolver: zodResolver(RuleEditAdapterSchema),
  });

  const index = rule.index;

  // An emptied field is removed from the node when it is left, not at the
  // first erased character: see `writeRuleEdit`.
  const removalPending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const writeAll = useMemo(
    () =>
      form.handleSubmit((patch) => {
        removalPending.current = false;
        writeRuleEdit(edit, index, patch, form.getValues(), true);
      }),
    [form, edit, index]
  );

  useEffect(
    function writeOnChange() {
      const revision = ConfigDocumentState.getState().revision;
      const writeTyped = form.handleSubmit((patch) => {
        removalPending.current = writeRuleEdit(edit, index, patch, form.getValues(), !isTextEntryFocused());
      });

      // Only a user change is written. A reset from `values` sets the
      // untouched fields one by one with `setValue`, and a write in the middle
      // of it would put half-reset values over an edit that came from outside.
      const subscription = form.watch((_values, { type }) => {
        if (type === 'change') {
          void writeTyped();
        }
      });

      // Leaving a field writes only a held-back removal: an unconditional
      // write here would resolve after the next change and take it too.
      const element = formRef.current;
      const writeHeldBack = () => {
        if (removalPending.current) {
          void writeAll();
        }
      };

      element?.addEventListener('focusout', writeHeldBack);

      return function stopWritingOnChange() {
        subscription.unsubscribe();
        element?.removeEventListener('focusout', writeHeldBack);

        // A document replaced from outside (a discarded draft) is not written
        // over: the form would bring back what was just discarded.
        if (removalPending.current && ConfigDocumentState.getState().revision === revision) {
          void writeAll();
        }
      };
    },
    [form, edit, index, writeAll]
  );

  return (
    <FormProvider {...form}>
      <form
        ref={formRef}
        className='flex flex-col gap-3'
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <ActionField />
        <OutboundField outbounds={outbounds} />
        {rule.group === null && <RuleSetField ruleSets={ruleSets} initial={initialSets} />}
        {rule.group === null && (
          <RuleConditionFields initial={RULE_CONDITIONS.filter((key) => initialConditions[key].length > 0)} />
        )}
        {rule.group === null && onlyEditable && <CatchAllWarning />}
      </form>
    </FormProvider>
  );
}

/**
 * Writes the fields that differ from the node in the current draft, not from
 * the form start: a value typed and then erased back must leave the draft too.
 * The node is read from the store text at the moment of the write, since the
 * parsed rule rows lag the text by a frame.
 *
 * Without `withRemovals` an emptied condition or set list stays in the draft
 * until the field is left, and the result says something was held back: removing the key at the first erased character and
 * adding it back with the next typed one would move it to the end of the node,
 * and the diff would show the whole node instead of one line.
 */
function writeRuleEdit(
  edit: (path: JSONPath, value: unknown) => void,
  index: number,
  patch: RuleEditPatch,
  values: RuleEditModel,
  withRemovals: boolean
): boolean {
  const path = ruleNodePath(index);
  const current = toRuleRowsFromNodes([findValue(ConfigDocumentState.getState().current() ?? '', path)]).at(0);

  if (current === undefined) {
    return false;
  }

  const before = toFormValues(current);
  let skipped = false;

  // A rule without an `action` key is normal (`route` is implied), and an
  // appended key would get into the diff as an edit the user did not make.
  if (values.action !== before.action) {
    edit([...path, 'action'], patch.action);
  }

  if (values.action !== before.action || values.outbound !== before.outbound) {
    edit([...path, 'outbound'], 'outbound' in patch ? patch.outbound : undefined);
  }

  // Sets are compared as sets: a set removed and chosen again changes only the
  // order.
  const ruleSet = 'rule_set' in patch ? patch.rule_set : undefined;

  if (!sameTags(values.ruleSet, before.ruleSet)) {
    if (withRemovals || ruleSet !== undefined) {
      edit([...path, RULE_SET_MATCHER], ruleSet);
    } else {
      skipped = true;
    }
  }

  // A condition is compared by lines: an extra space or an empty line does
  // not count as an edit and does not get into the diff.
  for (const key of RULE_CONDITIONS) {
    const condition = patch.conditions[key];

    if (sameLines(conditionLines(values.conditions[key]), conditionLines(before.conditions[key]))) {
      continue;
    }

    if (withRemovals || condition !== undefined) {
      edit([...path, key], condition);
    } else {
      skipped = true;
    }
  }

  return skipped;
}

function toFormValues(rule: RuleRow): RuleEditModel {
  return {
    action: isKnownAction(rule.target, rule.targetKind) ? rule.target : RULE_ACTION.Route,
    outbound: rule.targetKind === 'outbound' ? rule.target : '',
    // The `"rule_set": "x"` string arrives as a list; while the field is
    // untouched, the node is not rewritten and the string stays a string.
    ruleSet: ruleSetsOf(rule),
    conditions: conditionTexts(rule),
  };
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
 * Rule sets. Options are the document sets and the rule's own sets: a tag that
 * is not in the document stays selected and is marked rather than silently
 * disappearing, since only `sing-box check` may forbid the write.
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
              {/* In `multiple` mode the value is a list: the label is built
                  by a function, `placeholder` will not replace it. */}
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
 * A rule without conditions takes all traffic, and the rules below will not
 * fire. The warning does not block the write: such a rule is sometimes
 * intentional.
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
 * All rule conditions are edited by the form and at least one is set: after
 * removing them the user gets a rule without conditions. The
 * `rule_set_ip_cidr_*` flags start with the set name and do not count as a
 * condition: without sets there is nothing for them to refine.
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
    source_ip_cidr: text('source_ip_cidr'),
    port: text('port'),
  };
}

function sameLines(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}

/** Whether tag sets are equal regardless of order. */
function sameTags(left: readonly (string | undefined)[], right: readonly (string | undefined)[]): boolean {
  const tags = new Set(left);

  return tags.size === new Set(right).size && right.every((tag) => tags.has(tag));
}

/** Schema failure code into text: the message arrives as a string, the keys are our own. */
function errorText(t: TFunction<'features/Rule/RuleEdit'>, message: string | undefined): string | null {
  const key = message === undefined ? undefined : ERROR_KEY[message];

  return key === undefined ? null : t(key);
}

function isKnownAction(target: string, kind: RuleRow['targetKind']): target is RuleEditModel['action'] {
  return kind === 'action' && Object.values(RULE_ACTION).some((action) => action === target);
}
