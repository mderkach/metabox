import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  QueryFailure,
  SkeletonRows,
  buttonVariants,
} from '@shared/ui';

import { useRouteExplanationState } from '../lib/RouteExplanation.lib';
import { RouteExplanationBefore } from './RouteExplanationBefore';
import { RouteExplanationChain } from './RouteExplanationChain';
import { RouteExplanationMatched } from './RouteExplanationMatched';

export function RouteExplanationBody({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation('widgets/RouteExplanation');
  const state = useRouteExplanationState(connectionId);
  const drifted = state.compared && !state.trusted;

  return (
    <div className='flex min-h-0 grow flex-col gap-3 overflow-y-auto p-4'>
      {state.isPending && <SkeletonRows rows={4} className='p-0' />}

      {state.query.isLoadingError && <QueryFailure messageKey='source.route' query={state.query} />}

      {state.explanation !== null && (
        <>
          <RouteExplanationMatched explanation={state.explanation} trusted={state.trusted} drifted={drifted} />

          {drifted && (
            <Alert>
              <AlertTitle>{t('drift.title')}</AlertTitle>
              <AlertDescription>
                {t('drift.description', {
                  running: state.explanation.rules.length,
                  document: state.inDocument,
                })}
              </AlertDescription>
              <AlertAction className='static col-start-2 mt-2 justify-self-start'>
                <Link to='/config' className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  {t('drift.open')}
                </Link>
              </AlertAction>
            </Alert>
          )}

          {!state.compared && <p className='text-xs text-pretty text-muted-foreground'>{t('drift.notCompared')}</p>}

          <RouteExplanationChain nodes={state.explanation.chain.nodes} origin={state.explanation.chain.origin} />

          {state.before.length > 0 && <RouteExplanationBefore rules={state.before} numbered={!drifted} />}

          <p className='text-xs text-pretty text-muted-foreground'>{t('origin.note')}</p>
        </>
      )}
    </div>
  );
}
