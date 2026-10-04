import type { UseQueryResult } from '@tanstack/react-query';
import { useDeferredValue, useEffect } from 'react';

import { parseConfig, useConfig, useConfigLists, type ConfigIssue, type ParsedConfig } from '../api/Config.query';
import type { ConfigDocument } from './Config.model';
import { ConfigDocumentState, useConfigDirty, useConfigText } from './Config.store';

/** Сколько последних текстов помнит разбор черновика. */
const PARSED_DRAFTS = 2;

/** Разобранные черновики по тексту; порядок вставки — порядок обращения. */
const parsedDrafts = new Map<string, ParsedConfig>();

/**
 * Черновик читают и раскладка раздела, и экран под ней. Без общей памяти один
 * и тот же текст разбирался бы дважды на каждую правку.
 *
 * Память модульная, а не `useMemo`: она общая на всех потребителей и живёт до
 * конца сессии вкладки — ни `discard`, ни `reset` её не сбрасывают. Ключ — сам
 * текст, поэтому устаревший разбор вернуться не может.
 *
 * Записей две, а не одна, из-за `useDeferredValue`: пока на экране разбор
 * текста T1, фоновый рендер успевает разобрать T2, но новое нажатие прерывает
 * его до показа. Срочный рендер этого нажатия снова спрашивает T1, а
 * одноместная память держала бы уже T2 — разбор T1 повторился бы в срочном
 * рендере, ради ухода из которого его и откладывали.
 */
function parseDraft(text: string): ParsedConfig {
  const remembered = parsedDrafts.get(text);
  const parsed = remembered ?? parseConfig(text);

  // Обращение переставляет запись в конец: вытесняется давно не нужный текст.
  parsedDrafts.delete(text);
  parsedDrafts.set(text, parsed);

  if (parsedDrafts.size > PARSED_DRAFTS) {
    const [oldest] = parsedDrafts.keys();

    parsedDrafts.delete(oldest);
  }

  return parsed;
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
   *
   * При наборе он отстаёт от `text` на кадр: разбор отложен за вводом.
   */
  config: ConfigDocument | null;
  /** Его же текст: узлы читаются отсюда, чтобы непринятые схемой остались видимыми. */
  text: string | null;
  /** Текст файла с устройства, без правок: с ним сверяется черновик. */
  appliedText: string | null;
  /** Замечания схемы к показанному документу — отстают вместе с `config`. */
  issues: ConfigIssue[];
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
 *
 * Разбор черновика — `parseJsonc` всего файла и строгая схема целиком — идёт
 * отложенным рендером (`useDeferredValue`): в текстовом режиме черновик меняется
 * на каждый символ, и разбор в срочном рендере вставал бы между нажатием и
 * буквой на экране. Текст, признак правок и счётчик обновлений читаются мимо
 * разбора и не отстают; разобранный документ нужен счётчикам вкладок и
 * спискам форм, им кадр отставания безразличен.
 */
export function useConfigDocument(): ConfigDocumentView {
  const config = useConfig();
  const lists = useConfigLists();
  const load = ConfigDocumentState.use.load();
  const loadLists = ConfigDocumentState.use.loadLists();
  const draft = ConfigDocumentState.use.draft();
  const revision = ConfigDocumentState.use.revision();
  const isDirty = useConfigDirty();
  const current = useConfigText();
  const applied = config.data?.text ?? null;
  const etag = config.data?.etag ?? null;
  const listFiles = lists.data?.files;
  const listsEtag = lists.data?.etag ?? null;

  useEffect(
    function loadDocument() {
      if (applied !== null) load(applied, etag);
    },
    [applied, etag, load]
  );

  // Файлы списков едут в стор тем же путём, что текст конфига: применение
  // берёт из него и изменения файлов, и базу набора.
  useEffect(
    function loadListFiles() {
      if (listFiles !== undefined) loadLists(listFiles, listsEtag);
    },
    [listFiles, listsEtag, loadLists]
  );

  const parsedDraft = useDeferredValue(draft);
  const shown = (parsedDraft === null ? null : parseDraft(parsedDraft)) ?? config.data ?? null;

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
