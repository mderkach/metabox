import type { ParseKeys, TFunction } from 'i18next';

/** Имена режимов по умолчанию; режим из правил конфига показывается как есть. */
const CLASH_MODE_LABEL: Readonly<Record<string, ParseKeys<'shared'> | undefined>> = {
  rule: 'clashMode.rule',
  global: 'clashMode.global',
  direct: 'clashMode.direct',
};

export function toClashModeLabel(t: TFunction<'shared'>, mode: string): string {
  const key = CLASH_MODE_LABEL[mode.toLowerCase()];

  return key === undefined ? mode : t(key);
}
