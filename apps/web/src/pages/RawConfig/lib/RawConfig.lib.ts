import { useEffect } from 'react';

import { ConfigDocumentState, useConfig, useConfigText } from '@entities/Config';

export interface RawConfigState {
  isPending: boolean;
  /**
   * Счётчик обновлений документа, пришедших не от пользователя. Экран
   * пересоздаёт по нему редактор: своё поле ввода тот держит сам, и без этого
   * отмена правок осталась бы только в сторе.
   */
  revision: number;
  /** Текст, который правит пользователь: черновик, а до правок — файл с устройства. */
  text: string | null;
  /** Схема конфиг не приняла: формы недоступны, текстовый режим — да. */
  notParsed: boolean;
  issues: string[];
}

/**
 * Текст конфига для правки руками.
 *
 * Экран открывается и тогда, когда схема конфиг не приняла: разбор нужен формам
 * и подсказкам, а текстовому режиму — нет.
 */
export function useRawConfig(): RawConfigState {
  const config = useConfig();
  const load = ConfigDocumentState.use.load();
  const current = useConfigText();
  const revision = ConfigDocumentState.use.revision();
  const text = config.data?.text ?? null;

  useEffect(
    function loadDocument() {
      if (text !== null) load(text);
    },
    [text, load]
  );

  return {
    isPending: config.isPending,
    revision,
    text: current ?? text,
    notParsed: config.data?.config === null,
    issues: config.data?.issues ?? [],
  };
}
