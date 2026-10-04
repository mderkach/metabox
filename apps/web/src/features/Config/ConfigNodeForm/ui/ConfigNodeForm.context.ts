import { createContext } from 'react';

/** Тип ошибки, которую ставит raw-поле с неразобранным JSON. */
export const RAW_PARSE_ERROR = 'parse';

/**
 * Raw-поля с неразобранным JSON, по имени. Значение формы у такого поля
 * прежнее, и резолвер его пропустит, поэтому запись останавливает этот набор.
 * Набор один на форму и не меняется: контекст поверх формы её не перерисовывает.
 */
export const RawFailuresContext = createContext<Set<string>>(new Set());
