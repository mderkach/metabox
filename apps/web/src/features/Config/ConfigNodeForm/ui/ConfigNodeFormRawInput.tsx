import { parseJsonc } from '@shared/lib/jsonc';
import { Textarea } from '@shared/ui';

import { useFieldText } from '../lib/ConfigNodeForm.text';
import { UNSET } from '../model';
import { toJsonText } from '../model/ConfigNodeForm.mask';

export function ConfigNodeFormRawInput({
  id,
  value,
  invalid,
  describedBy,
  onBlur,
  onParsed,
  onFailure,
}: {
  id: string;
  value: unknown;
  invalid: boolean;
  describedBy: string;
  onBlur: () => void;
  onParsed: (value: unknown) => void;
  onFailure: (reason: string) => void;
}) {
  const { text, setDraft } = useFieldText(value, toJsonText);

  return (
    <Textarea
      id={id}
      value={text}
      spellCheck={false}
      className='min-h-20 font-mono text-xs'
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onBlur={onBlur}
      onChange={(event) => {
        const next = event.target.value;

        if (next.trim() === '') {
          setDraft({ text: next, value: UNSET });
          onParsed(UNSET);

          return;
        }

        const { value: parsed, failure } = parseJsonc(next);

        if (failure !== null) {
          // The form value is the previous one: only the parsed one goes into the draft.
          setDraft({ text: next, value });
          onFailure(failure.text);

          return;
        }

        setDraft({ text: next, value: parsed });
        onParsed(parsed);
      }}
    />
  );
}
