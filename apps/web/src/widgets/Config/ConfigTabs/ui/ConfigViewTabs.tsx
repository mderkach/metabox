import { Link, useRouterState } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConfigDocument } from '@entities/Config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui';

import { CONFIG_SIMPLE_ROUTE, CONFIG_TABS, CONFIG_TEXT_ROUTE, tabPath } from '../model';
import { ConfigTabs } from './ConfigTabs';

export function ConfigViewTabs({
  config,
  children,
  renderHeader,
}: {
  config: ConfigDocument | null;
  children: ReactNode;
  renderHeader: (views: ReactNode, simple: boolean) => ReactNode;
}) {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  const pathname = useRouterState({ select: (state) => state.location.pathname.replace(/\/$/u, '') });
  const editorSection = CONFIG_TABS.find((section) => tabPath(section) === pathname);
  const [lastEditor, setLastEditor] = useState(editorSection ?? CONFIG_TABS[0]);
  let view = 'editor';
  if (pathname === CONFIG_SIMPLE_ROUTE) view = 'simple';
  if (pathname === CONFIG_TEXT_ROUTE) view = 'json';

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
            render={<Link to={CONFIG_SIMPLE_ROUTE} activeOptions={{ exact: true, includeSearch: false }} />}
          >
            {t('views.simple')}
          </TabsTrigger>
          <TabsTrigger
            value='editor'
            nativeButton={false}
            render={<Link {...lastEditor.link} activeOptions={{ exact: true, includeSearch: false }} />}
          >
            {t('views.editor')}
          </TabsTrigger>
          <TabsTrigger
            value='json'
            nativeButton={false}
            render={<Link to={CONFIG_TEXT_ROUTE} activeOptions={{ exact: true, includeSearch: false }} />}
          >
            {t('views.json')}
          </TabsTrigger>
        </TabsList>,
        view === 'simple'
      )}
      <TabsContent value={view} className='flex min-h-0 flex-col'>
        {view === 'editor' && <ConfigTabs config={config} />}
        {children}
      </TabsContent>
    </Tabs>
  );
}
