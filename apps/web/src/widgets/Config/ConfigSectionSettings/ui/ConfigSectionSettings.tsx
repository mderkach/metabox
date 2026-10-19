import { ChevronRight } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  isSectionSettingsRecognized,
  readSectionSettings,
  useConfigDocument,
  type ListSettingsSection,
} from '@entities/Config';
import { ConfigSectionForm } from '@features/Config/ConfigNodeForm';
import { cn } from '@shared/lib/utils';
import { Badge, Button, SURFACE } from '@shared/ui';

/**
 * Scalars of the `route` or `dns` section as a card above its list. Collapsed by
 * default: they are edited rarely, and an expanded form would push the list down —
 * so even expanded it is no taller than part of the screen.
 * The collapsed body stays mounted, and what was typed is not lost.
 *
 * The form does not open a section with an unfamiliar field: the schema will not accept it, and
 * not a single field could be saved.
 */
export function ConfigSectionSettings({ section }: { section: ListSettingsSection }) {
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
        {/* The revision in the key recreates the form on an update not from the user:
            after discarding changes the field must not keep the discarded value. */}
        {recognized && <ConfigSectionForm key={document.revision} section={section} settings={settings} />}
      </div>
    </section>
  );
}
