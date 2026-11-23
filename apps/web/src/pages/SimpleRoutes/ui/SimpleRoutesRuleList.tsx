import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentStore, RULES_PATH, selectConfigCurrent, selectConfigStale } from '@entities/Config';
import { RULE_TARGET, useRuleTitle } from '@entities/Rule';
import { toRuleSetRowsFromNodes, useRuleSetCatalog, type RuleSetRow } from '@entities/RuleSet';
import { Button, Card, CardContent } from '@shared/ui';

import type { toSimpleRoutes } from '../model/SimpleRoutes.model';
import {
  SIMPLE_RULE_GROUPS,
  simpleMoveLimit,
  simpleRuleGroup,
  type SimpleMoveLimit,
} from '../model/SimpleRoutes.order';
import { SimpleRoutesCustomAction } from './SimpleRoutesCustomAction';
import { SimpleRoutesRuleFilter } from './SimpleRoutesRuleFilter';
import { SimpleRoutesRuleRow } from './SimpleRoutesRuleRow';
import { SimpleRoutesServiceSuggestions } from './SimpleRoutesServiceSuggestions';

export function SimpleRoutesRuleList({
  model,
  text,
  outbound,
}: {
  model: ReturnType<typeof toSimpleRoutes>;
  text: string;
  outbound?: string;
}) {
  const { t } = useTranslation('pages/SimpleRoutes');
  const { subject } = useRuleTitle();
  const catalog = useRuleSetCatalog();
  const sets = useMemo(() => {
    const byTag = new Map<string, RuleSetRow | null>();
    for (const set of toRuleSetRowsFromNodes(
      model.setNodes,
      model.usage,
      catalog.data ?? { providers: [] },
      new Map()
    )) {
      byTag.set(set.tag, byTag.has(set.tag) ? null : set);
    }
    return byTag;
  }, [model.setNodes, model.usage, catalog.data]);
  const [ordered, setOrdered] = useState(false);
  const drag = useRef<{ from: number; text: string } | null>(null);
  const [hover, setHover] = useState<{ index: number; limit: SimpleMoveLimit | null } | null>(null);
  const [notice, setNotice] = useState<{ from: number; text: string; message: string } | null>(null);
  const { ruleNodes, rules } = model;
  const tags = [
    ...new Set([
      ...model.outbounds.flatMap(({ tag }) => (tag !== undefined && tag !== '' ? [tag] : [])),
      ...rules
        .filter((rule) => rule.targetKind === RULE_TARGET.Outbound && rule.target !== '')
        .map(({ target }) => target),
      ...(outbound === undefined ? [] : [outbound]),
    ]),
  ];
  const shown = rules.filter(
    (rule) => outbound === undefined || (rule.targetKind === RULE_TARGET.Outbound && rule.target === outbound)
  );
  const entries = shown.map((rule) => ({
    rule,
    node: ruleNodes[rule.index - 1],
    group: simpleRuleGroup(rule, ruleNodes[rule.index - 1]),
  }));
  const groups = ordered
    ? [{ key: 'order' as const, entries }]
    : SIMPLE_RULE_GROUPS.map((key) => ({
        key,
        entries: entries.filter(({ group }) => group === key),
      }));

  function allowMove(from: number, to: number) {
    const state = ConfigDocumentStore.getState();
    if (
      outbound !== undefined ||
      model.duplicateKeys ||
      selectConfigStale(state) ||
      selectConfigCurrent(state) !== text
    ) {
      setNotice({ from, text, message: t('list.unsafe') });
      return false;
    }
    const limit = simpleMoveLimit(ruleNodes, from, to);
    if (limit !== null) {
      setNotice({ from, text, message: t(`list.${limit.reason}`, { index: limit.index }) });
      return false;
    }
    setNotice(null);
    return true;
  }

  function startDrag(from: number | null) {
    drag.current = from === null ? null : { from, text };
    setHover(null);
    if (from !== null) setNotice(null);
  }

  function previewMove(index: number) {
    const source = drag.current;
    if (source === null || source.text !== text) return false;
    if (source.from === index) setHover(null);
    else
      setHover((previous) =>
        previous?.index === index ? previous : { index, limit: simpleMoveLimit(ruleNodes, source.from, index) }
      );
    return true;
  }

  function release(to: number) {
    const source = drag.current;
    if (source?.text === text && source.from !== to && allowMove(source.from, to)) {
      if (!ConfigDocumentStore.getState().move(RULES_PATH, source.from - 1, to - 1))
        setNotice({ from: source.from, text, message: t('list.unsafe') });
    }
    drag.current = null;
    setHover(null);
  }

  return (
    <>
      {rules.length > 0 && (
        <>
          <details className='group text-sm'>
            <summary className='flex w-fit cursor-pointer list-none items-center gap-1 font-medium marker:content-none'>
              <ChevronDown
                aria-hidden='true'
                className='size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none'
              />
              {t('list.help')}
            </summary>
            <p className='mt-2 max-w-prose text-muted-foreground'>{t('list.explanation')}</p>
          </details>
          <div className='flex flex-wrap items-center gap-2'>
            <div role='group' aria-label={t('list.view')} className='flex flex-wrap gap-1'>
              <Button
                size='sm'
                variant={ordered ? 'outline' : 'secondary'}
                aria-pressed={!ordered}
                onClick={() => {
                  setOrdered(false);
                  setNotice(null);
                }}
              >
                {t('list.byType')}
              </Button>
              <Button
                size='sm'
                variant={ordered ? 'secondary' : 'outline'}
                aria-pressed={ordered}
                onClick={() => {
                  setOrdered(true);
                  setNotice(null);
                }}
              >
                {t('list.byOrder')}
              </Button>
            </div>
            <SimpleRoutesRuleFilter tags={tags} outbound={outbound} />
          </div>
        </>
      )}
      {outbound !== undefined && (
        <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm wrap-anywhere'>
          <p>{t('rules.filtered', { outbound })}</p>
          <Link
            to='/config/simple'
            search={{ outbound: undefined }}
            resetScroll={false}
            className='text-primary underline underline-offset-4'
          >
            {t('rules.clear')}
          </Link>
          {ordered && <p className='basis-full text-muted-foreground'>{t('list.filteredOrder')}</p>}
        </div>
      )}
      {ordered && model.duplicateKeys && <p className='text-sm text-muted-foreground'>{t('list.unsafe')}</p>}
      {groups.map(({ key, entries: rows }) => {
        if (rows.length === 0) return null;
        return (
          <Card size='sm' key={key}>
            <CardContent>
              {key !== 'order' && <h3 className='mb-1 text-sm font-semibold'>{t(`list.groups.${key}`)}</h3>}
              <ol className='divide-y divide-border'>
                {rows.map(({ rule, group, node }) => (
                  <SimpleRoutesRuleRow
                    key={model.ruleKeys[rule.index - 1]}
                    rule={rule}
                    group={group}
                    node={node}
                    subject={subject(rule)}
                    sets={sets}
                    usage={model.usage}
                    text={text}
                    outbound={outbound}
                    ordered={ordered && !model.duplicateKeys}
                    total={ruleNodes.length}
                    notice={notice?.from === rule.index && notice.text === text ? notice.message : undefined}
                    preview={hover?.index === rule.index ? hover : null}
                    onDrag={startDrag}
                    onPreview={previewMove}
                    onDrop={release}
                    allowMove={allowMove}
                  />
                ))}
              </ol>
            </CardContent>
          </Card>
        );
      })}
      {shown.length === 0 && (
        <Card size='sm'>
          <CardContent>
            {model.empty && outbound === undefined ? (
              <SimpleRoutesServiceSuggestions />
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t(outbound === undefined ? 'rules.empty' : 'rules.noMatches')}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <div>
        <SimpleRoutesCustomAction text={text} initialOutbound={outbound} />
      </div>
    </>
  );
}
