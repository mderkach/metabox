import { ConfigDocumentStore, RULES_PATH, selectConfigCurrent } from '@entities/Config';

export type RuleMovePolicy = (from: number, to: number) => boolean;

export function moveRouteRule(reviewedText: string | null, from: number, to: number, allowMove?: RuleMovePolicy) {
  if (allowMove?.(from, to) === false) return 'blocked';

  const document = ConfigDocumentStore.getState();
  if (reviewedText === null || selectConfigCurrent(document) !== reviewedText) return 'failed';

  return document.move(RULES_PATH, from - 1, to - 1) ? 'moved' : 'failed';
}
