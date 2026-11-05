import { ListTree } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type JsoncOutlineEntry, jsoncOutline } from '@shared/lib/jsonc';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@shared/ui';

import { ConfigRawOutlineEntry } from './ConfigRawOutlineEntry';

/**
 * Config text outline: root sections and their nested lists, navigation is
 * by the cursor in the field to the section key. Computed only while the window is open: there is
 * no reason to parse the text on every keystroke for a closed outline.
 *
 * The list is buttons, not a `nav` with links: navigation goes inside the field, and it has
 * no address.
 */
export function ConfigRawOutline({
  text,
  onJump,
}: {
  text: string;
  /** Select the section key in the field and scroll to it. */
  onJump: (offset: number, length: number) => void;
}) {
  const { t } = useTranslation('widgets/Config/ConfigRawEditor');
  const [open, setOpen] = useState(false);
  const outline = useMemo(() => (open ? jsoncOutline(text) : []), [open, text]);

  function jump(entry: JsoncOutlineEntry) {
    setOpen(false);
    onJump(entry.offset, entry.length);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('outline.open')}
            className='ml-auto text-muted-foreground hover:text-foreground'
          />
        }
      >
        <ListTree />
      </PopoverTrigger>
      <PopoverContent align='end' className='max-h-96 overflow-y-auto'>
        {outline.length === 0 ? (
          <p className='text-xs text-muted-foreground'>{t('outline.empty')}</p>
        ) : (
          <ul aria-label={t('outline.label')} className='flex flex-col'>
            {outline.map((entry) => (
              <li key={entry.offset}>
                <ConfigRawOutlineEntry entry={entry} onJump={jump} />
                {entry.children.length > 0 && (
                  <ul className='flex flex-col pl-4'>
                    {entry.children.map((child) => (
                      <li key={child.offset}>
                        <ConfigRawOutlineEntry entry={child} onJump={jump} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
