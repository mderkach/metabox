import { useTranslation } from 'react-i18next';

import { isLogLevel, LOG_LEVELS, type LogLevel } from '@entities/Log';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

/** Минимальный уровень: демон отдаёт его и всё, что серьёзнее. */
export function LogsLevelSelect({
  level,
  onLevelChange,
}: {
  level: LogLevel;
  onLevelChange: (level: LogLevel) => void;
}) {
  const { t } = useTranslation('pages/Logs');
  const items = LOG_LEVELS.map((value) => ({ value, label: t('level.option', { level: value }) }));

  return (
    <Select
      items={items}
      value={level}
      onValueChange={(value: string | null) => {
        if (value !== null && isLogLevel(value)) {
          onLevelChange(value);
        }
      }}
    >
      <SelectTrigger size='sm' className='w-36' aria-label={t('level.label')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
