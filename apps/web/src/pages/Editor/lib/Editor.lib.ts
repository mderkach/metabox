import { useMemo } from 'react';

import { useConfig } from '@entities/Config';
import { toRuleRows, type RuleRow } from '@entities/Rule';
import type { Config } from '@shared/api/generated';

export interface RouteEditorState {
  isPending: boolean;
  issues: string[];
  config: Config | null;
  rules: RuleRow[];
  /** `null` — `route.final` не задан, решает последнее правило без условий. */
  final: string | null;
}

/**
 * Маппинг живёт здесь, а не в разметке: он пробегает весь список, и на 500
 * правилах (NFR-2) вызов из тела рендера повторялся бы на каждое нажатие
 * клавиши в поиске.
 */
export function useRouteEditor(): RouteEditorState {
  const config = useConfig();
  const parsed = config.data ?? null;
  const document = parsed?.config ?? null;

  const rules = useMemo(() => toRuleRows(document), [document]);

  return {
    isPending: config.isPending,
    issues: parsed?.issues ?? [],
    config: document,
    rules,
    final: document?.route?.final ?? null,
  };
}
