import { ListTree } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type JsoncOutlineEntry, jsoncOutline } from '@shared/lib/jsonc';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@shared/ui';

/**
 * Оглавление текста конфига: секции корня и их вложенные списки, переход —
 * курсором в поле на ключ секции. Считается только при открытом окне: на
 * каждое нажатие клавиши разбирать текст ради закрытого оглавления незачем.
 *
 * Список — кнопки, а не `nav` со ссылками: переход ведёт внутри поля, адреса
 * у него нет.
 */
export function ConfigRawOutline({
  text,
  onJump,
}: {
  text: string;
  /** Выделить ключ секции в поле и прокрутить к нему. */
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
                <OutlineEntry entry={entry} onJump={jump} />
                {entry.children.length > 0 && (
                  <ul className='flex flex-col pl-4'>
                    {entry.children.map((child) => (
                      <li key={child.offset}>
                        <OutlineEntry entry={child} onJump={jump} />
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

function OutlineEntry({ entry, onJump }: { entry: JsoncOutlineEntry; onJump: (entry: JsoncOutlineEntry) => void }) {
  return (
    <Button
      variant='ghost'
      size='sm'
      onClick={() => {
        onJump(entry);
      }}
      className='w-full justify-between font-mono text-xs'
    >
      <span className='truncate'>{entry.key}</span>
      {entry.size !== null && <span className='text-muted-foreground tabular-nums'>{entry.size}</span>}
    </Button>
  );
}
