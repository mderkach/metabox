import i18next from 'i18next';

const TIME_PARTS = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
} as const satisfies Intl.DateTimeFormatOptions;

export function formatLogTime(at: Date): string {
  return at.toLocaleTimeString(i18next.language, TIME_PARTS);
}
