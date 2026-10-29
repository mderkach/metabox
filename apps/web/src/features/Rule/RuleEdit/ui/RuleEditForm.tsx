import { zodResolver } from '@hookform/resolvers/zod';
import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { ConfigDocumentState, ConfigDocumentStore } from '@entities/Config';
import { ruleSetsOf, useRuleTitle, type RuleRow } from '@entities/Rule';
import { showQueryError } from '@shared/api';
import { useWriteOnChange } from '@shared/lib/useWriteOnChange';

import { conditionTexts, hasOnlyEditableConditions, toRuleEditValues, writeRuleEdit } from '../model/RuleEdit.model';
import {
  RULE_CONDITIONS,
  RuleEditAdapterSchema,
  type RuleEditModel,
  type RuleEditPatch,
} from '../model/RuleEdit.schema';
import { RuleActionField } from './RuleActionField';
import { RuleCatchAllWarning } from './RuleCatchAllWarning';
import { RuleConditionFields } from './RuleConditionFields';
import { RuleNameField } from './RuleNameField';
import { RuleOutboundField } from './RuleOutboundField';
import { RuleSetField } from './RuleSetField';

/**
 * Rule name, action, outbound, sets and common conditions. A valid change goes into
 * the draft at once. A logical rule gets neither sets nor conditions: they
 * live in its nested rules.
 */
export function RuleEditForm({
  rule,
  outbounds,
  ruleSets,
  onCreate,
}: {
  rule: RuleRow;
  outbounds: string[];
  /** Set tags of the document. */
  ruleSets: string[];
  /** The rule is not in the document yet: its node goes here once it has a condition. */
  onCreate?: (node: Record<string, unknown>) => boolean;
}) {
  const edit = ConfigDocumentState.use.edit();
  const rename = ConfigDocumentState.use.rename();
  const { title } = useRuleTitle();
  const revision = ConfigDocumentState.use.revision();
  const values = useMemo(() => toRuleEditValues(rule), [rule]);
  const initialConditions = conditionTexts(rule);

  const form = useForm<RuleEditModel, unknown, RuleEditPatch>({
    defaultValues: values,
    // Pulls in an edit of the same node made as text without erasing what is being typed.
    values,
    resetOptions: { keepDirtyValues: true },
    mode: 'onChange',
    shouldFocusError: false,
    resolver: zodResolver(RuleEditAdapterSchema),
  });

  const renameOrWarn = (path: JSONPath, name: string) => {
    if (!rename(path, name)) {
      showQueryError({ showError: true, errorMessageKey: 'toast.rule.rename.failed' }, null);
    }
  };

  const formRef = useWriteOnChange(
    form,
    (patch, withRemovals) =>
      writeRuleEdit(edit, renameOrWarn, rule.index, patch, form.getValues(), withRemovals, onCreate),
    () => ConfigDocumentStore.getState().revision !== revision
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
        <RuleNameField placeholder={title({ ...rule, name: null })} />
        <RuleActionField />
        <RuleOutboundField outbounds={outbounds} />
        {rule.group === null && <RuleSetField ruleSets={ruleSets} initial={ruleSetsOf(rule)} />}
        {rule.group === null && (
          <RuleConditionFields initial={RULE_CONDITIONS.filter((key) => initialConditions[key].length > 0)} />
        )}
        {rule.group === null && hasOnlyEditableConditions(rule) && <RuleCatchAllWarning />}
      </form>
    </FormProvider>
  );
}
