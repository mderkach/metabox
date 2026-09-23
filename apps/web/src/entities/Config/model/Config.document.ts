import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import { parseConfig, useConfig, type ParsedConfig } from '../api/Config.query';
import type { ConfigDocument } from './Config.model';
import { ConfigDocumentState, useConfigDirty, useConfigText } from './Config.store';

/** Разобранный черновик с памятью на один текст. */
let lastParsed: { text: string; parsed: ParsedConfig } | null = null;

/**
 * Черновик читают и раскладка раздела, и экран под ней. Без общей памяти один
 * и тот же текст разбирался бы дважды на каждую правку.
 *
 * Память модульная, а не `useMemo`: она общая на всех потребителей и живёт до
 * конца сессии вкладки — ни `discard`, ни `reset` её не сбрасывают. Держит она
 * ровно одну запись, и ключ — сам текст, поэтому устаревший разбор вернуться не
 * может.
 */
function parseDraft(text: string): ParsedConfig {
  if (lastParsed === null || lastParsed.text !== text) {
    lastParsed = { text, parsed: parseConfig(text) };
  }

  return lastParsed.parsed;
}

export interface ConfigDocumentView {
  isPending: boolean;
  /**
   * Запрос файла с устройства. Его флаги и есть состояния экрана: отказ здесь
   * даёт пустой документ, и по пустоте его не отличить от конфига без правил.
   */
  query: UseQueryResult<ParsedConfig>;
  /**
   * Документ, который видит пользователь: черновик, а до правок — файл с
   * устройства. Черновик, который схема не приняла, даёт `null` — вместе с ним
   * пропадают счётчики секций в полосе вкладок и список аутбаундов в форме
   * подключения сета. Откат на применённый конфиг здесь сознательно не
   * делается: показывать разбор не того текста, который правят, хуже.
   */
  config: ConfigDocument | null;
  /** Его же текст: узлы читаются отсюда, чтобы непринятые схемой остались видимыми. */
  text: string | null;
  /** Текст файла с устройства, без правок: с ним сверяется черновик. */
  appliedText: string | null;
  /** Замечания схемы к показанному документу. */
  issues: string[];
  /** Схема не приняла файл с устройства: формы по нему не строятся, текст правится. */
  notParsed: boolean;
  /**
   * Счётчик обновлений документа, пришедших не от пользователя. По нему
   * текстовый редактор понимает, что его содержимое устарело.
   */
  revision: number;
  isDirty: boolean;
}

/**
 * Документ конфига для всего раздела: запрос, загрузка в стор и разбор
 * черновика в одном месте.
 */
export function useConfigDocument(): ConfigDocumentView {
  const config = useConfig();
  const load = ConfigDocumentState.use.load();
  const draft = ConfigDocumentState.use.draft();
  const revision = ConfigDocumentState.use.revision();
  const isDirty = useConfigDirty();
  const current = useConfigText();
  const applied = config.data?.text ?? null;

  useEffect(
    function loadDocument() {
      if (applied !== null) load(applied);
    },
    [applied, load]
  );

  const shown = (draft === null ? null : parseDraft(draft)) ?? config.data ?? null;

  return {
    isPending: config.isPending,
    query: config,
    config: shown?.config ?? null,
    text: current ?? applied,
    appliedText: applied,
    issues: shown?.issues ?? [],
    notParsed: config.data?.config === null,
    revision,
    isDirty,
  };
}
