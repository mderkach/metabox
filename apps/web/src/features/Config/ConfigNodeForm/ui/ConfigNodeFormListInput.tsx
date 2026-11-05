import { Textarea } from '@shared/ui';

import { useFieldText } from '../lib/ConfigNodeForm.text';
import { listToText } from '../model';

export function ConfigNodeFormListInput({
  id,
  value,
  invalid,
  describedBy,
  onBlur,
  onChange,
  onValue,
}: {
  id: string;
  value: unknown;
  invalid: boolean;
  describedBy: string;
  onBlur: () => void;
  /** Field text into a form value. */
  onChange: (text: string) => unknown;
  onValue: (value: unknown) => void;
}) {
  const { text, setDraft } = useFieldText(value, listToText);

  return (
    <Textarea
      id={id}
      value={text}
      spellCheck={false}
      className='min-h-16 font-mono text-xs'
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onBlur={onBlur}
      onChange={(event) => {
        const next = onChange(event.target.value);

        setDraft({ text: event.target.value, value: next });
        onValue(next);
      }}
    />
  );
}
