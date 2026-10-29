import { Trans, useTranslation } from 'react-i18next';

import { RULE_CHANGE, useRuleTitle, type RuleChange, type RuleRow } from '@entities/Rule';

import { useRuleChangeSides, useRuleChanges } from '../lib/ConfigApply.lib';
import { ConfigApplySectionLink } from './ConfigApplySectionLink';

/** Summary lines before "and N more": further details are read in the diff itself. */
const SHOWN_CHANGES = 5;

const CHANGE_TEXT = {
  [RULE_CHANGE.Added]: 'diff.rules.added',
  [RULE_CHANGE.Removed]: 'diff.rules.removed',
  [RULE_CHANGE.Changed]: 'diff.rules.changed',
  [RULE_CHANGE.Target]: 'diff.rules.target',
  [RULE_CHANGE.Moved]: 'diff.rules.moved',
} as const satisfies Record<RuleChange['kind'], string>;

/**
 * A change is named by its rule: the name, or the label from its content, with
 * the number second. A removed rule is looked up in the applied config and has
 * no place in the draft to lead to; the others link to their row.
 */
export function ConfigApplyRuleChanges({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const changes = useRuleChanges();
  const sides = useRuleChangeSides();
  const { title, subject } = useRuleTitle();
  const ruleOf = (change: RuleChange): RuleRow | undefined =>
    (change.kind === RULE_CHANGE.Removed ? sides.applied : sides.draft).at(change.index - 1);
  // A target change names the outbounds itself: the label goes without its own outbound.
  const labelOf = (change: RuleChange): string => {
    const rule = ruleOf(change);

    if (rule === undefined) return t('rule.numbered', { ns: 'shared', index: change.index });

    return change.kind === RULE_CHANGE.Target ? subject(rule) : title(rule);
  };

  if (changes.length === 0) return null;

  const rest = changes.length - SHOWN_CHANGES;

  return (
    <ul aria-label={t('diff.rules.label')} className='flex flex-col gap-0.5 text-sm'>
      {changes.slice(0, SHOWN_CHANGES).map((change) => (
        <li key={`${change.kind}:${String(change.index)}`}>
          {change.kind === RULE_CHANGE.Removed ? (
            t(CHANGE_TEXT[change.kind], { ...change, title: labelOf(change) })
          ) : (
            <Trans
              t={t}
              i18nKey={CHANGE_TEXT[change.kind]}
              values={{ ...change, title: labelOf(change) }}
              components={{
                node: (
                  <ConfigApplySectionLink
                    link={{ to: '/config' }}
                    search={{ rule: change.index }}
                    onNavigate={onNavigate}
                  />
                ),
              }}
            />
          )}
        </li>
      ))}
      {rest > 0 && <li className='text-muted-foreground'>{t('diff.rules.more', { count: rest })}</li>}
    </ul>
  );
}
