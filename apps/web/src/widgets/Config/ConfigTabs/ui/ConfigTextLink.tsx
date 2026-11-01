import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowLeft, Braces } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { buttonVariants } from '@shared/ui';

import { CONFIG_TEXT_ROUTE, CONFIG_TABS, tabPath } from '../model';

const LINK_CLASS = cn(buttonVariants({ variant: 'outline', size: 'sm' }));

/**
 * The whole file as text is an action on the document, like version history, not a view of
 * one section: it lives in the header, away from the section strip.
 *
 * From the text it leads back to the section open before it, or to routing when the text was
 * opened by its address. The header lives in the config layout and outlives the switch, so the
 * section is remembered here.
 */
export function ConfigTextLink() {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const section = CONFIG_TABS.find((tab) => tabPath(tab) === pathname) ?? null;
  const [lastSection, setLastSection] = useState(section);

  if (section !== null && section !== lastSection) {
    setLastSection(section);
  }

  if (pathname === CONFIG_TEXT_ROUTE) {
    return (
      <Link {...(lastSection ?? CONFIG_TABS[0]).link} className={LINK_CLASS}>
        <ArrowLeft />
        <span className='max-sm:sr-only'>{t('text.back')}</span>
      </Link>
    );
  }

  return (
    <Link to={CONFIG_TEXT_ROUTE} className={LINK_CLASS}>
      <Braces />
      <span className='max-sm:sr-only'>{t('text.open')}</span>
    </Link>
  );
}
