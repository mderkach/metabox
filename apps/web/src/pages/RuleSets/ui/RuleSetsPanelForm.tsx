import { RuleSetAddForm } from '@features/RuleSet/RuleSetAdd';
import { RuleSetCustomForm } from '@features/RuleSet/RuleSetCustom';
import { RuleSetEditForm } from '@features/RuleSet/RuleSetEdit';

import { RULE_SET_FORM, type RuleSetEditorState, type RuleSetForm } from '../lib/RuleSets.lib';

export function RuleSetsPanelForm({
  editor,
  form,
  editing,
  onDone,
}: {
  editor: RuleSetEditorState;
  form: RuleSetForm;
  editing: number | null;
  onDone: () => void;
}) {
  if (form === RULE_SET_FORM.Custom) {
    return <RuleSetCustomForm takenTags={editor.takenTags} onDone={onDone} />;
  }

  if (form === RULE_SET_FORM.Catalog) {
    return (
      <RuleSetAddForm
        catalog={editor.catalog}
        takenTags={editor.takenTags}
        outbounds={editor.outbounds}
        onDone={onDone}
      />
    );
  }

  const node: unknown = editing === null ? undefined : editor.nodes[editing];

  if (editing === null || typeof node !== 'object' || node === null) {
    return null;
  }

  return (
    <RuleSetEditForm
      key={editing}
      index={editing}
      node={{ ...node }}
      takenTags={editor.takenTags}
      outbounds={editor.outbounds}
      onDone={onDone}
    />
  );
}
