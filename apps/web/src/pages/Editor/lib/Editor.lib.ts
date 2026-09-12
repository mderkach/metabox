import { useEffect, useMemo } from 'react';

import {
  ConfigDocumentState,
  parseConfig,
  readRules,
  useConfig,
  useConfigDirty,
  useConfigText,
} from '@entities/Config';
import { toRuleRowsFromNodes, type RuleRow } from '@entities/Rule';
import type { Config } from '@shared/api/generated';

/** Теги аутбаундов конфига: из них выбирается исход правила. */
function toOutboundTags(config: Config | null): string[] {
  const outbounds: unknown = config?.outbounds;

  if (!Array.isArray(outbounds)) {
    return [];
  }

  const tags: string[] = [];

  for (const outbound of outbounds) {
    if (typeof outbound !== 'object' || outbound === null) {
      continue;
    }

    const tag: unknown = Reflect.get(outbound, 'tag');

    if (typeof tag === 'string' && tag.length > 0) {
      tags.push(tag);
    }
  }

  return tags;
}

export interface RouteEditorState {
  isPending: boolean;
  issues: string[];
  config: Config | null;
  rules: RuleRow[];
  outbounds: string[];
  /** Узлы правил как есть: панель правит текст узла, а не разобранную модель. */
  nodes: unknown[];
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

  useEffect(
    function loadDocument() {
      if (text !== null) load(text);
    },
    [text, load]
  );

  // Применённый конфиг разбирает `select` запроса, черновик — здесь: разбирать
  // один и тот же текст дважды на каждую правку незачем.
  const edited = useMemo(() => (draft === null ? null : parseConfig(draft)), [draft]);
  const shown = edited ?? config.data ?? null;
  const document = shown?.config ?? null;

  // Узлы читаются из текста, а не из разобранной модели: правило, которое
  // схема не приняла, обязано остаться видимым в списке (UX-3).
  const shownText = useConfigText() ?? text;

  const nodes = useMemo(() => (shownText === null ? [] : readRules(shownText)), [shownText]);

  const rules = useMemo(() => toRuleRowsFromNodes(nodes), [nodes]);

  return {
    isPending: config.isPending,
    issues: shown?.issues ?? [],
    config: document,
    rules,
    outbounds: toOutboundTags(document),
    nodes,
    isDirty,
  };
}

/**
 * Строка списка по номеру правила из адреса.
 *
 * В адресе номер как в интерфейсе, с единицы, а строка адресуется индексом
 * узла `route.rules`, считая с нуля: экран соединений ведёт сюда на конкретный
 * узел, и промах на единицу открыл бы соседнее правило (ADR-0007).
 */
export function toSelectedRuleId(rule: number | undefined): string | null {
  return rule === undefined ? null : String(rule - 1);
}
