import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Popover, PopoverContent, PopoverDescription, PopoverTrigger, SECTION_HEADING } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';

export function SimpleRoutesSection({
  section,
  actions,
  children,
}: {
  section: 'interception' | 'dns' | 'outbounds' | 'rules';
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dismissedByScroll = useRef(false);
  const [open, setOpen] = useState(false);
  const { t } = useTranslation(SIMPLE_ROUTES_NS);
  const title = t(`sections.${section}`);
  const helpLabel = t('help.label', { section: title });

  useEffect(
    function dismissWhenAnchorIsHidden() {
      if (!open || trigger.current === null) return;

      const observer = new IntersectionObserver(function closeWhenOutside(entries) {
        if (entries.some((entry) => !entry.isIntersecting)) {
          dismissedByScroll.current = true;
          setOpen(false);
        }
      });
      observer.observe(trigger.current);
      return function disconnectObserver() {
        observer.disconnect();
      };
    },
    [open]
  );

  function changeOpen(next: boolean) {
    if (next) dismissedByScroll.current = false;
    setOpen(next);
  }

  return (
    <section aria-labelledby={id} className='flex min-w-0 flex-col gap-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-1'>
          <h2 id={id} className={SECTION_HEADING}>
            {title}
          </h2>
          <Popover open={open} onOpenChange={changeOpen}>
            <PopoverTrigger
              ref={trigger}
              aria-label={helpLabel}
              render={<Button type='button' variant='ghost' size='icon-sm' />}
            >
              <Info aria-hidden />
            </PopoverTrigger>
            <PopoverContent
              align='start'
              aria-label={helpLabel}
              finalFocus={() => !dismissedByScroll.current}
              className='max-h-(--available-height) max-w-[calc(100vw-2rem)] overflow-y-auto text-pretty in-data-anchor-hidden:invisible motion-reduce:animate-none!'
            >
              <PopoverDescription className='text-popover-foreground'>{t(`help.${section}`)}</PopoverDescription>
            </PopoverContent>
          </Popover>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
