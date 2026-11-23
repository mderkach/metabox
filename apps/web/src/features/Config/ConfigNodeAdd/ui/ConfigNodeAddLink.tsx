import { zodResolver } from '@hookform/resolvers/zod';
import type { ParseKeys } from 'i18next';
import { useId, useMemo, type ReactNode } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, useConfigCurrent, type GenericSection } from '@entities/Config';
import { showQueryError } from '@shared/api';
import { cn } from '@shared/lib/utils';
import { Button, Input, Label, Textarea } from '@shared/ui';

import { useNodeInsert } from '../model/ConfigNodeAdd.insert';
import { NODE_LINK_ERROR, parseShareLink, shareLinkNode, shareLinkTag } from '../model/ConfigNodeAdd.link';
import {
  NODE_ADD_ERROR,
  CONNECTION_LINK_DEFAULTS,
  makeConnectionLinkSchema,
  type ConnectionLinkModel,
} from '../model/ConfigNodeAdd.schema';
import {
  stageSubscription,
  SUBSCRIPTION_ERROR,
  subscriptionTags,
  subscriptionUrl,
} from '../model/ConfigNodeAdd.subscription';
import { ConfigNodeAddSubscriptionFields } from './ConfigNodeAddSubscriptionFields';

const NS = 'features/Config/ConfigNodeAdd';

/** Failure code into text; an unknown code is named as itself. */
const LINK_ERROR_KEY: Readonly<Record<string, ParseKeys<typeof NS> | undefined>> = {
  [NODE_ADD_ERROR.LinkRequired]: 'error.linkRequired',
  [NODE_LINK_ERROR.Scheme]: 'error.link.scheme',
  [NODE_LINK_ERROR.Subscription]: 'error.link.subscription',
  [NODE_LINK_ERROR.Malformed]: 'error.link.malformed',
  [NODE_LINK_ERROR.Server]: 'error.link.server',
  [NODE_LINK_ERROR.Credential]: 'error.link.credential',
  [NODE_LINK_ERROR.Transport]: 'error.link.transport',
  [SUBSCRIPTION_ERROR.InvalidLink]: 'subscription.invalidLink',
};

export function ConfigNodeAddLink({
  section,
  takenTags,
  onAdded,
  cancel,
  subscriptionFallback,
}: {
  section: GenericSection;
  takenTags: readonly string[];
  onAdded?: (tag: string) => void;
  cancel?: ReactNode;
  subscriptionFallback?: ReactNode;
}) {
  const { t } = useTranslation(NS);
  const insertNode = useNodeInsert(section);
  const id = useId();
  const hintId = useId();
  const omissionId = useId();
  const errorId = useId();

  const allowSubscriptions = subscriptionFallback !== undefined;
  const current = useConfigCurrent();
  const applied = ConfigDocumentState.use.applied();
  const schema = useMemo(
    () =>
      makeConnectionLinkSchema(
        allowSubscriptions,
        allowSubscriptions ? subscriptionTags(current ?? '{}', applied) : new Set()
      ),
    [allowSubscriptions, current, applied]
  );
  const form = useForm<ConnectionLinkModel>({
    defaultValues: CONNECTION_LINK_DEFAULTS,
    mode: 'onSubmit',
    resolver: zodResolver(schema),
  });
  const input = useWatch({ control: form.control, name: 'link' });
  const isSubscription = allowSubscriptions && subscriptionUrl(input) !== null;
  const rootError = form.formState.errors.root?.message;
  const LinkInput = allowSubscriptions ? Input : Textarea;

  const onSubmit = form.handleSubmit((data) => {
    if (allowSubscriptions && subscriptionUrl(data.link) !== null) {
      const failure = stageSubscription(data);
      if (failure !== null) {
        form.setError(failure.field, { message: failure.message }, { shouldFocus: failure.field !== 'root' });
        return;
      }

      form.reset(CONNECTION_LINK_DEFAULTS);
      onAdded?.(data.tag.trim());
      return;
    }

    const { link } = parseShareLink(data.link);

    if (link === null) {
      return;
    }

    const tag = shareLinkTag(link, takenTags);

    if (!insertNode(shareLinkNode(link, tag))) {
      showQueryError({ showError: true, errorMessageKey: 'toast.config.edit.failed' }, null);

      return;
    }
    form.reset(CONNECTION_LINK_DEFAULTS);
    onAdded?.(tag);
  });

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className='flex flex-col gap-3'
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <Controller
          control={form.control}
          name='link'
          render={({ field, fieldState }) => {
            const message = fieldState.error?.message;
            const key = message === undefined ? undefined : LINK_ERROR_KEY[message];
            const error = key === undefined ? (message ?? null) : t(key);
            const omittedParams = parseShareLink(field.value).link?.omittedParams ?? [];
            const describedBy = [hintId, omittedParams.length > 0 && omissionId, error !== null && errorId]
              .filter(Boolean)
              .join(' ');

            return (
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor={id}>{t('field.link.label')}</Label>
                <LinkInput
                  ref={field.ref}
                  id={id}
                  value={field.value}
                  type={allowSubscriptions ? 'password' : undefined}
                  placeholder={t(allowSubscriptions ? 'subscription.linkPlaceholder' : 'field.link.placeholder')}
                  autoComplete='off'
                  spellCheck={false}
                  className={cn('w-full font-mono text-xs', !allowSubscriptions && 'min-h-20 break-all')}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={describedBy}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                />
                <div>
                  <p
                    id={hintId}
                    role={allowSubscriptions ? 'status' : undefined}
                    className='text-xs text-pretty text-muted-foreground'
                  >
                    {isSubscription
                      ? t('subscription.notice')
                      : t(allowSubscriptions ? 'subscription.linkHint' : 'field.link.hint')}
                  </p>
                  <p id={omissionId} role='status' className='text-xs wrap-anywhere text-signal-warn'>
                    {omittedParams.length > 0 && (
                      <span className='mt-1.5 block'>
                        {t('field.link.omittedParams', { names: omittedParams.join(', ') })}
                      </span>
                    )}
                  </p>
                </div>
                {error !== null && (
                  <p id={errorId} role='alert' className='text-xs text-pretty text-destructive'>
                    {error}
                  </p>
                )}
              </div>
            );
          }}
        />

        {isSubscription && <ConfigNodeAddSubscriptionFields />}
        {isSubscription && rootError !== undefined && (
          <p role='alert' className='text-sm text-destructive'>
            {t(rootError === SUBSCRIPTION_ERROR.Stale ? 'subscription.stale' : 'subscription.writeFailed')}
          </p>
        )}
        {allowSubscriptions && /^http:\/\//i.test(input.trim()) && subscriptionFallback}
        <div className={cn(cancel !== undefined && 'flex flex-wrap items-center justify-end gap-2')}>
          {cancel}
          <Button type='submit'>{t(allowSubscriptions ? 'subscription.stage' : 'submitLink')}</Button>
        </div>
      </form>
    </FormProvider>
  );
}
