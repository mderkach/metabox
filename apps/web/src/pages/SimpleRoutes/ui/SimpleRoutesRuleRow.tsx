import { Link } from '@tanstack/react-router';
import { ChevronDown, GripVertical } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ruleActionLabel, RULE_TARGET, ruleSetReferencesOf, type RuleRow } from '@entities/Rule';
import type { RuleSetRow, RuleSetUsage } from '@entities/RuleSet';
import { RuleSetReferenceLinks, RuleSetSourceDetails } from '@entities/RuleSet';
import { canAddDeviceException, RuleCustomAddButton } from '@features/Rule/RuleCustomAdd';
import { RuleReorderButtons } from '@features/Rule/RuleReorder';
import { SHARED_NS } from '@shared/i18n';
import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import type { SimpleRuleNavigation, SimpleRoutesLinks } from '../model/SimpleRoutes.links';
import type { SimpleMoveLimit, SimpleRuleGroup } from '../model/SimpleRoutes.order';

export function SimpleRoutesRuleRow({
  rule,
  node,
  group,
  subject,
  sets,
  usage,
  text,
  outbound,
  ordered,
  total,
  preview,
  notice,
  onDrag,
  onPreview,
  onDrop,
  allowMove,
  ruleLink,
  referenceLink,
}: Pick<SimpleRuleNavigation, 'referenceLink'> & {
  ruleLink: SimpleRoutesLinks['rule'];
  rule: RuleRow;
  node: unknown;
  group: SimpleRuleGroup;
  subject: string;
  sets: ReadonlyMap<string, RuleSetRow | null>;
  usage: ReadonlyMap<string, readonly RuleSetUsage[]>;
  text: string;
  outbound?: string;
  ordered: boolean;
  total: number;
  notice?: string;
  preview: { limit: SimpleMoveLimit | null; index: number } | null;
  onDrag: (index: number | null) => void;
  onPreview: (index: number) => boolean;
  onDrop: (index: number) => void;
  allowMove: (from: number, to: number) => boolean;
}) {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);
  const { t: tShared } = useTranslation(SHARED_NS);
  const id = useId();
  const [expanded, setExpanded] = useState<string | null>(null);
  const tags = ruleSetReferencesOf(rule);
  const set = expanded === null ? null : sets.get(expanded);
  const movable = ordered && outbound === undefined && group !== 'advanced';

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The list item is the drop target. RuleReorderButtons supplies the equivalent keyboard actions.
    <li
      value={rule.index}
      className={cn(
        'relative flex min-w-0 flex-col gap-2 py-2 text-sm wrap-anywhere',
        preview !== null && 'outline outline-primary'
      )}
      onDragOver={(event) => {
        if (onPreview(rule.index)) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(rule.index);
      }}
    >
      <div className='grid min-w-0 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-center gap-x-2 gap-y-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)]'>
        <div className='flex min-w-0 items-center gap-2'>
          {movable && (
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Only the grip starts native dragging. Keyboard users have move buttons in this row.
            <span
              draggable
              role='img'
              aria-label={t('list.drag', { index: rule.index })}
              className='cursor-grab text-muted-foreground active:cursor-grabbing'
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(rule.index));
                onDrag(rule.index);
              }}
              onDragEnd={() => {
                onDrag(null);
              }}
            >
              <GripVertical aria-hidden='true' className='size-4' />
            </span>
          )}
          <span className='shrink-0 font-mono text-muted-foreground tabular-nums'>{rule.index}.</span>
          <div className='flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2'>
            {!tags.includes(subject) && <span>{subject}</span>}
            {tags.map((tag) => (
              <Button
                key={tag}
                variant='link'
                size='sm'
                aria-expanded={expanded === tag}
                aria-controls={expanded === tag ? id : undefined}
                onClick={() => {
                  setExpanded(expanded === tag ? null : tag);
                }}
                className='max-w-full gap-1 px-0 font-mono whitespace-normal'
              >
                {tag}
                <ChevronDown aria-hidden='true' className={cn('size-3', expanded === tag && 'rotate-180')} />
              </Button>
            ))}
          </div>
        </div>
        <span className={cn('min-w-0 text-muted-foreground', rule.targetKind === RULE_TARGET.Outbound && 'font-mono')}>
          {ruleActionLabel(rule, tShared) ?? (rule.target || t('rules.targetUnknown'))}
        </span>
        {movable && (
          <span className='col-span-full inline-flex md:col-span-1 md:justify-self-end'>
            <RuleReorderButtons text={text} index={rule.index} total={total} allowMove={allowMove} />
          </span>
        )}
        {!ordered && canAddDeviceException(node) && (
          <div className='col-span-full md:col-span-1 md:justify-self-end'>
            <RuleCustomAddButton text={text} initialOutbound={outbound} ruleIndex={rule.index - 1} />
          </div>
        )}
      </div>
      {group === 'advanced' && (
        <Link {...ruleLink(rule.index)} className='w-fit text-xs text-primary underline underline-offset-4'>
          {t('list.advanced')}
        </Link>
      )}
      {notice !== undefined && (
        <p role='status' className='text-sm text-signal-warn'>
          {notice}
        </p>
      )}
      {preview !== null && (
        <p
          role='status'
          className='pointer-events-none absolute inset-x-0 top-full z-10 rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm'
        >
          {preview.limit === null
            ? t('list.drop', { index: preview.index })
            : t(`list.${preview.limit.reason}`, { index: preview.limit.index })}
        </p>
      )}
      {expanded !== null && tags.includes(expanded) && (
        <div id={id} className='flex min-w-0 flex-col gap-2 border-t border-border py-2'>
          {set?.recognized === true ? (
            <RuleSetSourceDetails description={set.description} />
          ) : (
            <p>{t('list.sourceUnavailable')}</p>
          )}
          <RuleSetReferenceLinks referenceLink={referenceLink} usage={usage.get(expanded) ?? []} />
        </div>
      )}
    </li>
  );
}
