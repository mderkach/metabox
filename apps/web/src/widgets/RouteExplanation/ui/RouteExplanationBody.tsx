import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ROUTE_MATCH } from '@entities/Route';
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
  const showFallback = state.explanation?.match.kind === ROUTE_MATCH.Rule && state.editorSearch.rule === undefined;
  const unmapped = state.appliedIndex === null;

  return (
    <div className='flex min-h-0 grow flex-col gap-3 overflow-y-auto p-4'>
      {state.isPending && <SkeletonRows rows={4} className='p-0' />}

      {state.query.isLoadingError && <QueryFailure messageKey='source.route' query={state.query} />}

      {state.explanation !== null && (
        <>
          <RouteExplanationMatched
            explanation={state.explanation}
            appliedIndex={state.appliedIndex}
            ruleName={state.ruleName}
            editorSearch={state.editorSearch}
          />

          {showFallback && (
            // Without an icon the alert grid has one column, and the action placed in the second
            // squeezed the title into a narrow strip.
            <Alert className='has-data-[slot=alert-action]:pr-2.5'>
              <TriangleAlert aria-hidden='true' />
              <AlertTitle>{t(unmapped ? 'drift.title' : 'draft.title')}</AlertTitle>
              <AlertDescription>{t(unmapped ? 'drift.description' : 'draft.description')}</AlertDescription>
              <AlertAction className='static col-start-2 mt-2 justify-self-start'>
                <Link to='/config' className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  {t('matched.openConfig')}
                </Link>
              </AlertAction>
            </Alert>
          )}

          <RouteExplanationChain nodes={state.explanation.chain.nodes} origin={state.explanation.chain.origin} />

          {state.before.length > 0 && <RouteExplanationBefore rules={state.before} numbered={!unmapped} />}

          <p className='text-xs text-pretty text-muted-foreground'>{t('origin.note')}</p>
        </>
      )}
    </div>
  );
}
