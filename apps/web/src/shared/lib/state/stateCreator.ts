import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * Набор middleware, общий для всех сторов приложения: `devtools` — чтобы шаги
 * применения было видно в расширении.
 *
 * Черновик immer из набора убран: правка узла конфига идёт по тексту, а не по
 * дереву, и ни один стор вложенных узлов не мутирует. Взамен каждый снапшот
 * потока оборачивался в прокси — на пяти тысячах соединений (NFR-2) это
 * съедало почти всё время обработчика ([ADR-0024](../../../../../../docs/adr/ADR-0024-drop-the-immer-draft-from-frontend-stores.md)).
 */
type Middlewares = [['zustand/devtools', never]];

/**
 * Фабрика стора. Собирается здесь, а не на месте, чтобы набор middleware не
 * разъезжался между сторами: `devtools` без имени сливает их в один поток.
 *
 * `name` виден в Redux DevTools и должен совпадать с ролью стора
 * (`ConfigDocument`, `ConnectionStream`).
 */
export function stateCreator<T extends object>(initializer: StateCreator<T, Middlewares>, name: string) {
  return create<T>()(devtools(initializer, { name, enabled: import.meta.env.DEV }));
}
