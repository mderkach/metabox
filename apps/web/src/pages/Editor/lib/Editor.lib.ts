import { useEffect, useMemo } from 'react';

import { ConfigDocumentState, parseConfig, useConfig, useConfigDirty } from '@entities/Config';
import { toFinalTarget, toRuleRows, type RuleRow } from '@entities/Rule';
import type { Config } from '@shared/api/generated';

export interface RouteEditorState {
  isPending: boolean;
  issues: string[];
  config: Config | null;
  rules: RuleRow[];
  /** `null` — `route.final` не задан, решает последнее правило без условий. */
  final: string | null;
  /** Экран показывает черновик, а не файл с устройства. */
  isDirty: boolean;
}

/**
 * Связывает запрос конфига, документ и список правил для экрана.
 *
 * Маппинг вызывается здесь, а не в разметке: он пробегает весь список, и на
 * 500 правилах (NFR-2) повторялся бы на каждое нажатие клавиши в поиске.
 */
export function useRouteEditor(): RouteEditorState {
  const config = useConfig();
  const load = ConfigDocumentState.use.load();
  const draft = ConfigDocumentState.use.draft();
  const isDirty = useConfigDirty();
  const text = config.data?.text ?? null;

  useEffect(() => {
    if (text !== null) load(text);
  }, [text, load]);

  // Применённый конфиг разбирает `select` запроса, черновик — здесь: разбирать
  // один и тот же текст дважды на каждую правку незачем.
  const edited = useMemo(() => (draft === null ? null : parseConfig(draft)), [draft]);
  const shown = edited ?? config.data ?? null;
  const document = shown?.config ?? null;

  const rules = useMemo(() => toRuleRows(document), [document]);

  return {
    isPending: config.isPending,
    issues: shown?.issues ?? [],
    config: document,
    rules,
    final: toFinalTarget(document),
    isDirty,
  };
}
