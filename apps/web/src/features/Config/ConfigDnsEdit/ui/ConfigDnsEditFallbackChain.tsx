import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { CONFIG_DNS_EDIT_NS } from '../i18n/ConfigDnsEdit.namespace.generated';
import type { DnsFallbackChain, DnsFallbackEdit } from '../model/ConfigDnsEdit.fallback';
import { ConfigDnsEditFallbackMember } from './ConfigDnsEditFallbackMember';

export function ConfigDnsEditFallbackChain({
  chain,
  text,
  stale,
  onEdit,
}: {
  chain: DnsFallbackChain;
  text: string;
  stale: boolean;
  onEdit: (edit: DnsFallbackEdit) => 'draft' | 'stale' | null;
}) {
  const { t } = useTranslation(CONFIG_DNS_EDIT_NS);
  const id = useId();
  const chooser = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const afterEdit = useRef<{ tag: string; focus: 'select' | 'row' } | null>(null);
  const openedAt = useRef(text);
  const [choice, setChoice] = useState<{ tag: string; text: string } | null>(null);
  const [drag, setDrag] = useState<{ tag: string; text: string } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [error, setError] = useState<'draft' | 'stale' | null>(null);
  const reason = stale ? 'stale' : chain.reason;
  const selected = choice?.text === text && chain.choices.includes(choice.tag) ? choice.tag : null;
  const backups = chain.members.slice(1);
  const items = chain.choices.map((value) => ({ value, label: value }));
  useEffect(
    function focusAfterMembershipChange() {
      const target = afterEdit.current;
      if (target === null) return;
      afterEdit.current = null;
      const row = rows.current.get(target.tag);
      const element = target.focus === 'row' ? row : (chooser.current ?? row ?? heading.current);
      element?.focus();
    },
    [text]
  );

  function edit(action: DnsFallbackEdit) {
    const failure = onEdit(action);
    setError(failure);
    return failure === null;
  }

  function add(tag: string) {
    if (edit({ add: tag })) {
      afterEdit.current = { tag, focus: 'row' };
      setChoice(null);
    }
  }

  function limitation() {
    if (reason === 'strategy') return t('fallback.strategy', { strategy: chain.strategy });
    if (reason === 'members') return t('fallback.members');
    return reason && t(`dns.reason.${reason}`);
  }

  return (
    <section aria-labelledby={id} className='grid min-w-0 gap-2'>
      <h4 ref={heading} tabIndex={-1} id={id} className='font-mono font-medium wrap-anywhere'>
        {chain.tag}
      </h4>
      {reason === null && <p className='max-w-prose text-xs text-muted-foreground'>{t('fallback.sequential')}</p>}
      {reason !== null && <p className='max-w-prose text-sm wrap-anywhere text-muted-foreground'>{limitation()}</p>}
      {reason !== null ? (
        <ul className='grid min-w-0 gap-1'>
          {chain.members.map((member, index) => (
            <li className='font-mono wrap-anywhere' key={index}>
              {member}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className='flex flex-wrap items-baseline gap-x-2 text-sm'>
            <span className='text-muted-foreground'>{t('fallback.first')}</span>
            <span className='font-mono wrap-anywhere'>{chain.members[0]}</span>
          </p>
          {chain.members.length > 1 ? (
            <ol start={2} aria-label={t('fallback.order')} className='divide-y rounded-lg border px-2'>
              {backups.map((member, offset) => (
                <ConfigDnsEditFallbackMember
                  key={member}
                  member={member}
                  index={offset + 1}
                  last={chain.members.length - 1}
                  isOver={over === offset + 1}
                  canDrop={drag?.text === text && drag.tag !== member}
                  onDrag={(tag) => {
                    setDrag(tag === null ? null : { tag, text });
                    setOver(null);
                  }}
                  onPreview={setOver}
                  onDrop={() => {
                    if (drag?.text === text && drag.tag !== member && edit({ move: drag.tag, to: offset + 1 }))
                      afterEdit.current = { tag: drag.tag, focus: 'row' };
                    setDrag(null);
                    setOver(null);
                  }}
                  onMove={(to, focusRow) => {
                    const moved = edit({ move: member, to });
                    if (moved && focusRow === true) afterEdit.current = { tag: member, focus: 'row' };
                    return moved;
                  }}
                  onRemove={() => {
                    if (edit({ remove: member })) {
                      const neighbour = backups.at(offset + 1) ?? backups[Math.max(0, offset - 1)];
                      afterEdit.current = { tag: neighbour, focus: 'select' };
                    }
                  }}
                  rowRef={(node) => {
                    if (node) rows.current.set(member, node);
                    else rows.current.delete(member);
                  }}
                />
              ))}
            </ol>
          ) : (
            <p className='text-sm text-muted-foreground'>{t('fallback.empty')}</p>
          )}
          {items.length === 1 && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='max-w-full justify-self-start wrap-anywhere whitespace-normal'
              onClick={() => {
                add(items[0].value);
              }}
            >
              {t('fallback.addNamed', { tag: items[0].value })}
            </Button>
          )}
          {items.length > 1 && (
            <div className='grid min-w-0 gap-1'>
              <Label htmlFor={`${id}-add`}>{t('fallback.choose', { tag: chain.tag })}</Label>
              <div className='flex min-w-0 flex-wrap items-center gap-2'>
                <Select
                  items={items}
                  value={selected}
                  onOpenChange={(open) => {
                    if (open) openedAt.current = text;
                  }}
                  onValueChange={(tag: string | null) => {
                    if (tag !== null) setChoice({ tag, text: openedAt.current });
                  }}
                >
                  <SelectTrigger ref={chooser} id={`${id}-add`} className='max-w-full min-w-0'>
                    <SelectValue className='min-w-0 truncate' placeholder={t('dns.choose')} />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map(({ value }) => (
                      <SelectItem key={value} value={value}>
                        <span className='font-mono wrap-anywhere'>{value}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={selected === null}
                  onClick={() => {
                    if (selected !== null) add(selected);
                  }}
                >
                  {t('fallback.add')}
                </Button>
              </div>
            </div>
          )}
          {!items.length && <p className='text-xs text-muted-foreground'>{t('fallback.noChoices')}</p>}
        </>
      )}
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {t(`dns.reason.${error}`)}
        </p>
      )}
    </section>
  );
}
