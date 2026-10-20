import { Check, Copy } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Textarea } from '@shared/ui';

import { copyText } from '../lib';

/**
 * A read-only value with a copy button. When the browser refuses the clipboard the value is
 * selected instead, and the result is announced through `announce`.
 */
export function McpAccessCopyField({
  label,
  value,
  multiline = false,
  focusOnMount = false,
  announce,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  /** Takes focus when shown: the button that led here has just unmounted. */
  focusOnMount?: boolean;
  announce: (text: string) => void;
}) {
  const { t } = useTranslation('features/Mcp/McpAccess');
  const fieldId = useId();
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(
    function focusOnShow() {
      if (focusOnMount) field.current?.focus();
    },
    [focusOnMount]
  );

  async function onCopy() {
    const done = await copyText(value);

    setCopied(done);
    announce(t(done ? 'copy.done' : 'copy.failed', { name: label }));

    if (!done) {
      field.current?.focus();
      field.current?.select();
    }
  }

  return (
    <div className='flex flex-col gap-1.5'>
      <label htmlFor={fieldId} className='text-sm font-medium'>
        {label}
      </label>
      <div className='flex items-start gap-1.5'>
        {multiline ? (
          <Textarea
            ref={field}
            id={fieldId}
            readOnly
            rows={3}
            value={value}
            className='min-w-0 flex-1 font-mono text-xs'
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
        ) : (
          <Input
            ref={field}
            id={fieldId}
            readOnly
            value={value}
            className='min-w-0 flex-1 font-mono text-xs'
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
        )}
        <Button
          type='button'
          variant='outline'
          size='icon'
          aria-label={t('copy.action', { name: label })}
          onClick={() => {
            void onCopy();
          }}
        >
          {copied ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}
        </Button>
      </div>
    </div>
  );
}
