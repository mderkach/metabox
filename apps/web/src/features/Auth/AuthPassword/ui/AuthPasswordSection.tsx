import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@entities/Auth';
import { CARD_TITLE, Card, CardContent, CardHeader } from '@shared/ui';

import { AuthPasswordForm } from './AuthPasswordForm';

/**
 * The panel password on the settings screen: set, change and removal in place. Hidden while
 * the daemon has not answered about login: an older daemon without the endpoint has nothing to set.
 */
export function AuthPasswordSection() {
  const { t } = useTranslation('features/Auth/AuthPassword');
  const auth = useAuth();
  // A finished save remounts the form: fields and the refusal of the previous attempt go away.
  const [round, setRound] = useState(0);

  if (!auth.isSuccess) {
    return null;
  }

  const protectedPanel = auth.data.enabled;

  return (
    <Card>
      <CardHeader className='flex flex-col gap-1'>
        <h3 className={CARD_TITLE}>{t(protectedPanel ? 'title.change' : 'title.set')}</h3>
        <p className='max-w-prose text-sm text-pretty text-muted-foreground'>
          {t(protectedPanel ? 'description.change' : 'description.set')}
        </p>
      </CardHeader>
      <CardContent className='max-w-xl'>
        <AuthPasswordForm
          key={`${String(protectedPanel)}:${String(round)}`}
          protectedPanel={protectedPanel}
          onDone={() => {
            setRound((count) => count + 1);
          }}
        />
      </CardContent>
    </Card>
  );
}
