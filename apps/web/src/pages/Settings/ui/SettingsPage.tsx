import { useTranslation } from 'react-i18next';

import { AuthPasswordSection } from '@features/Auth/AuthPassword';
import { McpAccessSection } from '@features/Mcp/McpAccess';
import { PageHeader } from '@widgets/PageHeader';

import { SettingsSection } from './SettingsSection';
import { SettingsSystem } from './SettingsSystem';

/**
 * Settings of the panel itself: access, agents, system. Rare actions that used to be
 * buttons in the sidebar footer; each section works on its own, without a wizard.
 */
export function SettingsPage() {
  const { t } = useTranslation('pages/Settings');

  return (
    <>
      <PageHeader title={t('section.settings', { ns: 'shared' })} />

      {/* Forms and short rows: past a reading width the actions drift away from their text. */}
      <div className='flex min-h-0 grow flex-col gap-6 overflow-y-auto px-4 py-5 *:max-w-4xl *:shrink-0 sm:px-6'>
        <SettingsSection title={t('access.title')}>
          <AuthPasswordSection />
        </SettingsSection>
        <SettingsSection title={t('agents.title')}>
          <McpAccessSection />
        </SettingsSection>
        <SettingsSection title={t('system.title')}>
          <SettingsSystem />
        </SettingsSection>
      </div>
    </>
  );
}
