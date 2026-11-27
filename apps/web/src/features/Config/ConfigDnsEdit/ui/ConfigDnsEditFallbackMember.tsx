import { type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Button, ReorderButtons, ReorderGrip } from '@shared/ui';

import { CONFIG_DNS_EDIT_NS } from '../i18n/ConfigDnsEdit.namespace.generated';

export function ConfigDnsEditFallbackMember({
  member,
  index,
  last,
  isOver,
  canDrop,
  onDrag,
  onPreview,
  onDrop,
  onMove,
  onRemove,
  rowRef,
}: {
  member: string;
  index: number;
  last: number;
  isOver: boolean;
  canDrop: boolean;
  onDrag: (tag: string | null) => void;
  onPreview: (index: number | null) => void;
  onDrop: () => void;
  onMove: (target: number, focusRow?: boolean) => boolean;
  onRemove: () => void;
  rowRef: Ref<HTMLLIElement>;
}) {
  const { t } = useTranslation(CONFIG_DNS_EDIT_NS);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The list item is the grip's drop target. Its buttons also support Alt+Arrow shortcuts.
    <li
      ref={rowRef}
      tabIndex={-1}
      className={cn(
        'flex min-w-0 flex-wrap items-center justify-between gap-x-2 rounded-sm py-1 focus-visible:ring-2 focus-visible:ring-ring',
        isOver && 'outline outline-primary'
      )}
      onDragOver={(event) => {
        if (canDrop) {
          event.preventDefault();
          onPreview(index);
        }
      }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))
          onPreview(null);
      }}
      onDrop={(event) => {
        if (canDrop) {
          event.preventDefault();
          onDrop();
        }
      }}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        const target = index + (event.key === 'ArrowUp' ? -1 : 1);
        if (target > 0 && target <= last) onMove(target, true);
      }}
    >
      <div className='flex min-w-0 items-center gap-2'>
        {last > 1 && (
          <ReorderGrip
            label={t('fallback.drag', { tag: member })}
            value={member}
            onStart={() => {
              onDrag(member);
            }}
            onEnd={() => {
              onDrag(null);
            }}
          />
        )}
        <span aria-hidden className='font-mono text-muted-foreground tabular-nums'>
          {index + 1}.
        </span>
        <span className='min-w-0 font-mono wrap-anywhere'>{member}</span>
      </div>
      <div className='flex flex-wrap items-center'>
        <ReorderButtons
          index={index}
          first={1}
          last={last}
          upLabel={t('fallback.up', { tag: member })}
          downLabel={t('fallback.down', { tag: member })}
          onMove={onMove}
        />
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-label={t('fallback.removeTag', { tag: member })}
          onClick={onRemove}
        >
          {t('fallback.remove')}
        </Button>
      </div>
    </li>
  );
}
