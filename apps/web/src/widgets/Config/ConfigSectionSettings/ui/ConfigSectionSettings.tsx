import { ChevronRight } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  isSectionSettingsRecognized,
  readSectionSettings,
  useConfigDocument,
  type SettingsSection,
} from '@entities/Config';
import { ConfigSectionForm } from '@features/Config/ConfigNodeForm';
import { cn } from '@shared/lib/utils';
import { Badge, Button, SURFACE } from '@shared/ui';

/**
 * Скаляры секции `route` или `dns` карточкой над её списком. Свёрнута по
 * умолчанию: правят их редко, а развёрнутая форма сдвигала бы список вниз, —
 * поэтому и развёрнутая она не выше части экрана.
 * Свёрнутое тело остаётся смонтированным, набранное не теряется.
 *
 * Секцию с незнакомым полем форма не открывает: схема её не примет, и
 * сохранить не получится ни одного поля (ADR-0018).
 */
export function ConfigSectionSettings({ section }: { section: SettingsSection }) {
  const { t } = useTranslation('widgets/Config/ConfigSectionSettings');
  const document = useConfigDocument();
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const bodyId = useId();
  const text = document.text;
  const settings = useMemo(() => (text === null ? null : readSectionSettings(text, section)), [text, section]);
  const recognized = useMemo(
    () => settings !== null && isSectionSettingsRecognized(section, settings),
    [settings, section]
  );

  if (!document.query.isSuccess || settings === null) {
    return null;
  }

  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-2 p-4', SURFACE)}>
      <header className='flex flex-wrap items-center gap-2'>
        <h2 id={headingId} className='text-sm'>
          <Button
            variant='ghost'
            size='sm'
            aria-expanded={open}
            aria-controls={bodyId}
            className='-ml-2'
            onClick={() => {
              setOpen(!open);
            }}
          >
            <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
            {t(`title.${section}`)}
          </Button>
        </h2>
        {!recognized && <Badge variant='outline'>{t('rule.uncovered', { ns: 'shared' })}</Badge>}
      </header>

      <div id={bodyId} hidden={!open} className='flex max-h-[60vh] flex-col gap-3 overflow-y-auto'>
        <p className='text-xs text-pretty text-muted-foreground'>{t(recognized ? 'hint' : 'uncovered', { section })}</p>
        {/* Ревизия в ключе пересоздаёт форму на обновлении не от пользователя:
            после отмены правок поле не должно держать отменённое. */}
        {recognized && <ConfigSectionForm key={document.revision} section={section} settings={settings} />}
      </div>
    </section>
  );
}
