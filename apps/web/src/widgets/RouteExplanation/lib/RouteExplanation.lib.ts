import { useMemo } from 'react';

import { readRules, useConfig } from '@entities/Config';
import { ROUTE_MATCH, useRouteExplanation, type RouteExplanation } from '@entities/Route';

/** Сколько правил показывать перед сработавшим. */
const VISIBLE_BEFORE = 5;

export interface RouteExplanationState {
  isPending: boolean;
  /** Запрос объяснения: отказ — своё состояние панели, а не пустое место под заголовком. */
  query: ReturnType<typeof useRouteExplanation>;
  explanation: RouteExplanation | null;
  /**
   * Список правил процесса сходится с применённым документом по длине.
   * `false` — вести пользователя на узел нельзя: core исполняет другой конфиг,
   * и индекс указал бы в чужой документ.
   */
  trusted: boolean;
  /** Правил в `route.rules` применённого документа; `null` — документ не разобран. */
  inDocument: number | null;
  /** Списки удалось сверить: конфиг прочитан и разобран. */
  compared: boolean;
  /** Правила до сработавшего: они проверялись и не совпали. */
  before: RouteExplanation['rules'];
}

/**
 * Сверка списка правил живёт на фронте, а не в демоне: демону запрещено
 * разбирать конфиг, а модель документа принадлежит панели. Сверяются
 * длины — поэлементное сравнение условий потребовало бы воспроизвести рендер
 * правил форка, то есть ровно тот дрейф, от которого объяснение маршрута
 * и уходит.
 */
export function useRouteExplanationState(connectionId: string | null): RouteExplanationState {
  const query = useRouteExplanation(connectionId);
  const config = useConfig();
  const explanation = query.data ?? null;
  // `null` — конфиг ещё не прочитан: это не то же самое, что «правил нет».
  const text = config.data?.text;
  const inDocument = useMemo(() => (text === undefined ? null : readRules(text).length), [text]);

  const before = useMemo(() => {
    if (explanation === null || explanation.match.kind !== ROUTE_MATCH.Rule || explanation.match.index === null) {
      return [];
    }

    return explanation.rules.slice(Math.max(0, explanation.match.index - VISIBLE_BEFORE), explanation.match.index);
  }, [explanation]);

  const compared = explanation !== null && inDocument !== null;

  return {
    isPending: query.isPending && connectionId !== null,
    query,
    explanation,
    trusted: compared && inDocument === explanation.rules.length,
    inDocument,
    compared,
    before,
  };
}
