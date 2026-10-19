import { RuleDeleteButton } from '@features/Rule/RuleDelete';
import { RuleReorderButtons } from '@features/Rule/RuleReorder';
import { Separator } from '@shared/ui';

/** Actions on the selected rule in the panel header. */
export function EditorRuleActions({
  index,
  total,
  onMoved,
  onDeleted,
}: {
  index: number;
  total: number;
  onMoved: (index: number) => void;
  onDeleted: () => void;
}) {
  return (
    <>
      <RuleReorderButtons index={index} total={total} onMoved={onMoved} />
      <Separator orientation='vertical' className='mx-1 h-5' />
      <RuleDeleteButton index={index} onDeleted={onDeleted} />
    </>
  );
}
