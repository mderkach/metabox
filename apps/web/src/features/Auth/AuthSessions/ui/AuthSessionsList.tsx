import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useSessions } from '@entities/Auth';
import { QueryFailure, SkeletonRows } from '@shared/ui';

import { useEndSession } from '../api';
import { AuthSessionsRow } from './AuthSessionsRow';

const SKELETON_ROWS = 2;

export function AuthSessionsList() {
  const { t } = useTranslation('features/Auth/AuthSessions');
  const sessions = useSessions();
  const endSession = useEndSession();
  // The ended row takes its button with it: focus moves to the list, not to the page start.
  const listRef = useRef<HTMLUListElement>(null);

  if (sessions.isPending) {
    return <SkeletonRows rows={SKELETON_ROWS} className='p-0' />;
  }

  if (sessions.isLoadingError) {
    return <QueryFailure messageKey='source.sessions' query={sessions} />;
  }

  const list = sessions.data.sessions;

  return (
    <div className='flex flex-col gap-3'>
      <ul ref={listRef} tabIndex={-1} aria-label={t('title')} className='flex flex-col divide-y outline-none'>
        {list.map((session) => (
          <AuthSessionsRow
            key={session.id}
            session={session}
            ending={endSession.isPending && endSession.variables === session.id}
            onEnd={() => {
              endSession.mutate(session.id, {
                onSuccess: function focusList() {
                  listRef.current?.focus();
                },
              });
            }}
          />
        ))}
      </ul>
      {list.every((session) => session.current) && <p className='text-xs text-muted-foreground'>{t('onlyThis')}</p>}
    </div>
  );
}
