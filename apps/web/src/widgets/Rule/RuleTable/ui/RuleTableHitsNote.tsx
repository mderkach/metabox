import { useTranslation } from 'react-i18next';

import { RULE_HITS_STATE, type RuleHitsColumn } from '../model';

const HITS_NOTE = {
  [RULE_HITS_STATE.Failed]: 'hits.failed',
  [RULE_HITS_STATE.Mismatch]: 'hits.mismatch',
} as const;

export function RuleTableHitsNote({ hits }: { hits: RuleHitsColumn | null }) {
  const { t } = useTranslation('widgets/Rule/RuleTable');

  if (hits === null || hits.state === RULE_HITS_STATE.Pending || hits.state === RULE_HITS_STATE.Counted) {
    return null;
  }

  return <p className='ml-auto'>{t(HITS_NOTE[hits.state])}</p>;
}
