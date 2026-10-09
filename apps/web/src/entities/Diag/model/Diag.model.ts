import { CHECK_NAME, CHECK_REASON, CHECK_STATUS } from '../api/Diag.schema';

export type CheckName = (typeof CHECK_NAME)[number];

export type CheckStatus = (typeof CHECK_STATUS)[number];

export type CheckReason = (typeof CHECK_REASON)[number];

export const DIAG_STATUS = {
  Ok: 'ok',
  Fail: 'fail',
  Skipped: 'skipped',
} as const satisfies Record<string, CheckStatus>;

export interface DiagCheck {
  /** Строка, а не `CheckName`: проверка, которой панель не знает, показывается как пришла. */
  name: string;
  status: CheckStatus;
  /** `null` при `ok`. Строка, а не `CheckReason`: незнакомый код показывается как есть. */
  reason: string | null;
  /** Подробность на языке демона — порт, исходная ошибка; идёт под текстом панели, а не вместо него. */
  detail: string | null;
  /** Отсутствующие цепочки nft при `chains_missing`. */
  missing: string[];
  /** Задержка в миллисекундах при `ok` у выхода через узел и прямого выхода. */
  delayMs: number | null;
}

export function isCheckName(value: string): value is CheckName {
  return CHECK_NAME.some((name) => name === value);
}

export function isCheckReason(value: string): value is CheckReason {
  return CHECK_REASON.some((reason) => reason === value);
}

export function isCheckStatus(value: string): value is CheckStatus {
  return CHECK_STATUS.some((status) => status === value);
}
