import { getDefaultNormalizer } from '@testing-library/react';

const WORD_JOINER = '⁠';
const normalizeDefault = getDefaultNormalizer();

/** The word joiner keeps a rate unit on one line and is invisible, so tests compare text without it. */
export function stripWordJoiners(text: string): string {
  return text.replaceAll(WORD_JOINER, '');
}

/** The `normalizer` option of text queries: the default one, after the word joiners are removed. */
export const WITHOUT_WORD_JOINERS = { normalizer: (text: string) => normalizeDefault(stripWordJoiners(text)) };
