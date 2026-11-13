import { useTranslation } from 'react-i18next';

import { useAuth } from '@entities/Auth';
import { CARD_TITLE, Card, CardContent, CardHeader } from '@shared/ui';

import { AuthSessionsList } from './AuthSessionsList';

/**
 * Panel sessions on the settings screen: where the panel is open and since when, and ending
 * the others. Shown only with a password and a live session: without a password there are no
 * sessions to list.
 */
export function AuthSessionsSection() {
  const { t } = useTranslation('features/Auth/AuthSessions');
  const auth = useAuth();

  if (!auth.isSuccess || !auth.data.authenticated) {
    return null;
  }

  return (
    <Card>
      <CardHeader className='flex flex-col gap-1'>
        <h3 className={CARD_TITLE}>{t('title')}</h3>
        <p className='max-w-prose text-sm text-pretty text-muted-foreground'>{t('description')}</p>
      </CardHeader>
      <CardContent className='max-w-xl'>
        <AuthSessionsList />
      </CardContent>
    </Card>
  );
}
