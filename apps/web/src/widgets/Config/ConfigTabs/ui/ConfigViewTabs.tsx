import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConfigDocument } from '@entities/Config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';

import { CONFIG_TABS_NS } from '../i18n/ConfigTabs.namespace.generated';
import { CONFIG_TABS, type ConfigViewLinks } from '../model';
import { ConfigTabs } from './ConfigTabs';

export function ConfigViewTabs({
  config,
  links,
  children,
  renderHeader,
}: {
  links: ConfigViewLinks;
  config: ConfigDocument | null;
  children: ReactNode;
  renderHeader: (views: ReactNode, simple: boolean) => ReactNode;
}) {
  const { t } = useTranslation(CONFIG_TABS_NS);
  const pathname = useRouterState({ select: (state) => state.location.pathname.replace(/\/$/u, '') });
  const router = useRouter();
  const editorSection = CONFIG_TABS.find(
    (section) => router.buildLocation(links.section(section.key)).pathname === pathname
  );
  const [lastEditor, setLastEditor] = useState(editorSection ?? CONFIG_TABS[0]);
  let view = 'editor';
  if (pathname === links.simple) view = 'simple';
  if (pathname === links.raw) view = 'json';

  if (editorSection !== undefined && lastEditor !== editorSection) {
    setLastEditor(editorSection);
  }

  return (
    <Tabs value={view} className='min-h-0 grow gap-0'>
      {renderHeader(
        <TabsList
          aria-label={t('views.label')}
          className='max-sm:grid max-sm:w-full max-sm:grid-cols-3 max-sm:group-data-horizontal/tabs:h-auto max-sm:[&>[role=tab]]:min-h-11'
        >
          <TabsTrigger
            value='simple'
            nativeButton={false}
            render={<Link to={links.simple} activeOptions={{ exact: true, includeSearch: false }} />}
          >
            {t('views.simple')}
          </TabsTrigger>
          <TabsTrigger
            value='editor'
            nativeButton={false}
            render={<Link {...links.section(lastEditor.key)} activeOptions={{ exact: true, includeSearch: false }} />}
          >
            {t('views.editor')}
          </TabsTrigger>
          <TabsTrigger
            value='json'
            nativeButton={false}
            render={<Link to={links.raw} activeOptions={{ exact: true, includeSearch: false }} />}
          >
            {t('views.json')}
          </TabsTrigger>
        </TabsList>,
        view === 'simple'
      )}
      <TabsContent value={view} className='flex min-h-0 flex-col'>
        {view === 'editor' && <ConfigTabs config={config} links={links} current={editorSection?.key ?? null} />}
        {children}
      </TabsContent>
    </Tabs>
  );
}
