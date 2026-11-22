import { ArrowRight, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useSaveOutboundMetadata, type OutboundMetadata, type OutboundMetadataMap } from '@entities/Proxy';
import { Button, ConfirmDialog, DESTRUCTIVE_OUTLINE } from '@shared/ui';

export function ProxiesUnusedMetadataRow({
  tag,
  entry,
  targets,
  metadata,
  announce,
}: {
  tag: string;
  entry: OutboundMetadata;
  targets: readonly string[];
  metadata: OutboundMetadataMap;
  announce: (message: string) => void;
}) {
  const { t } = useTranslation('pages/Proxies');
  const save = useSaveOutboundMetadata();
  const [target, setTarget] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [moving, setMoving] = useState(false);
  const [cleanUpFailed, setCleanUpFailed] = useState(false);
  const moveButton = useRef<HTMLButtonElement>(null);
  const selectId = useId();
  const busy = save.isPending || moving;

  function announceSaved(
    key: 'toast.outboundMetadata.removed' | 'toast.outboundMetadata.restored' | 'toast.outboundMetadata.moved'
  ) {
    const text = t(key, { ns: 'shared' });
    announce(text);

    return text;
  }

  async function move(selected: string) {
    setMoving(true);
    setCleanUpFailed(false);
    try {
      await save.mutateAsync({ tag: selected, entry });
      try {
        await save.mutateAsync({ tag, entry: {} });
        toast.success(announceSaved('toast.outboundMetadata.moved'));
      } catch {
        setCleanUpFailed(true);
      }
    } catch {
      // The original entry stays usable if the first write fails.
    } finally {
      setMoving(false);
    }
  }

  async function remove() {
    try {
      await save.mutateAsync({ tag, entry: {} });
    } catch {
      return;
    }

    toast.success(announceSaved('toast.outboundMetadata.removed'), {
      action: {
        label: t('metadata.undo'),
        onClick: () => {
          void save.mutateAsync({ tag, entry }).then(
            () => toast.success(announceSaved('toast.outboundMetadata.restored')),
            () => undefined
          );
        },
      },
    });
  }

  return (
    <li className='flex min-w-0 flex-col gap-2 px-(--card-spacing) py-2.5'>
      <p className='flex min-w-0 flex-col'>
        {entry.label !== undefined && (
          <span className='truncate text-sm' title={entry.label}>
            {entry.label}
          </span>
        )}
        <span className='truncate font-mono text-xs' title={tag}>
          {tag}
        </span>
        {entry.normMs !== undefined && (
          <span className='text-xs text-muted-foreground'>{t('metadata.norm', { value: entry.normMs })}</span>
        )}
      </p>
      <div className='flex min-w-0 flex-wrap items-end gap-2'>
        <label htmlFor={selectId} className='flex max-w-full min-w-0 flex-col gap-1 text-xs font-medium wrap-anywhere'>
          {t('metadata.target', { tag })}
          <select
            id={selectId}
            className='h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11'
            value={target ?? ''}
            disabled={busy}
            onChange={(event) => {
              setTarget(event.currentTarget.value || null);
            }}
          >
            <option value=''>{t('metadata.pick')}</option>
            {targets
              .filter((name) => name !== tag)
              .map((name) => (
                <option key={name} value={name}>
                  {metadata.has(name) ? t('metadata.hasEntry', { tag: name }) : name}
                </option>
              ))}
          </select>
        </label>
        <Button
          variant='outline'
          size='sm'
          ref={moveButton}
          disabled={busy || target === null || !targets.includes(target)}
          aria-label={t('metadata.moveTag', { tag })}
          onClick={() => {
            if (target === null) return;
            if (metadata.has(target)) {
              setConfirm(true);
            } else {
              void move(target);
            }
          }}
        >
          <ArrowRight aria-hidden='true' />
          {t('metadata.move')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          className={DESTRUCTIVE_OUTLINE}
          disabled={busy}
          aria-label={t('metadata.deleteTag', { tag })}
          onClick={() => {
            void remove();
          }}
        >
          <Trash2 aria-hidden='true' />
          {t('metadata.delete')}
        </Button>
      </div>
      {cleanUpFailed && (
        <p role='alert' className='text-xs text-destructive'>
          {t('metadata.moveCleanupFailed')}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('metadata.overwriteTitle', { tag: target ?? '' })}
        description={t('metadata.overwriteDescription')}
        cancelLabel={t('action.cancel', { ns: 'shared' })}
        confirmLabel={t('metadata.overwrite')}
        finalFocus={moveButton}
        destructive
        onConfirm={() => {
          if (target !== null && targets.includes(target)) void move(target);
        }}
      />
    </li>
  );
}
