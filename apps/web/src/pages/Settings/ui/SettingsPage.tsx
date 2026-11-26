import { useTranslation } from 'react-i18next';

import { AuthPasswordSection } from '@features/Auth/AuthPassword';
import { AuthSessionsSection } from '@features/Auth/AuthSessions';
import { McpAccessSection } from '@features/Mcp/McpAccess';
import { SHARED_NS } from '@shared/i18n';
import type { StaticPagePath } from '@shared/lib/navigation';
import { PageHeader } from '@widgets/PageHeader';

import { SETTINGS_NS } from '../i18n/Settings.namespace.generated';
import { SettingsSection } from './SettingsSection';
import { SettingsSystem } from './SettingsSystem';

/**
 * Settings of the panel itself: access, agents, system. Rare actions; each section
 * works on its own, without a wizard.
 */
export function SettingsPage({ devicesTo }: { devicesTo: StaticPagePath }) {
  const { t } = useTranslation(SETTINGS_NS);

  return (
    <>
      <PageHeader title={t('section.settings', { ns: SHARED_NS })} />

      {/* Forms and short rows: past a reading width the actions drift away from their text. */}
      <div className='flex min-h-0 grow flex-col gap-6 overflow-y-auto px-4 py-5 *:max-w-4xl *:shrink-0 sm:px-6'>
        <SettingsSection title={t('access.title')}>
          <AuthPasswordSection />
          <AuthSessionsSection />
        </SettingsSection>
        <SettingsSection title={t('agents.title')}>
          <McpAccessSection />
        </SettingsSection>
        <SettingsSection title={t('system.title')}>
          <SettingsSystem devicesTo={devicesTo} />
        </SettingsSection>
      </div>
    </>
  );
}
