import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { ConfigDocumentState } from '@entities/Config';
import { ruleSetsOf, type RuleRow } from '@entities/Rule';
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
import { RuleOutboundField } from './RuleOutboundField';
import { RuleSetField } from './RuleSetField';

/**
 * Rule action, outbound, sets and common conditions. A valid change goes into
 * the draft at once. A logical rule gets neither sets nor conditions: they
 * live in its nested rules.
 */
export function RuleEditForm({
  rule,
  outbounds,
  ruleSets,
}: {
  rule: RuleRow;
  outbounds: string[];
  /** Set tags of the document. */
  ruleSets: string[];
}) {
  const edit = ConfigDocumentState.use.edit();
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

  const formRef = useWriteOnChange(
    form,
    (patch, withRemovals) => writeRuleEdit(edit, rule.index, patch, form.getValues(), withRemovals),
    () => ConfigDocumentState.getState().revision !== revision
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
