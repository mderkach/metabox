import { zodResolver } from '@hookform/resolvers/zod';
import type { ParseKeys } from 'i18next';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { GenericSection } from '@entities/Config';
import { Button, Label, Textarea } from '@shared/ui';

import { useNodeInsert } from '../model/ConfigNodeAdd.insert';
import { NODE_LINK_ERROR, parseShareLink, shareLinkNode, shareLinkTag } from '../model/ConfigNodeAdd.link';
import {
  NODE_ADD_ERROR,
  NODE_LINK_DEFAULTS,
  NodeLinkFormSchema,
  type NodeLinkModel,
} from '../model/ConfigNodeAdd.schema';

const NS = 'features/Config/ConfigNodeAdd';

/** Failure code into text; an unknown code is named as itself. */
const LINK_ERROR_KEY: Readonly<Record<string, ParseKeys<typeof NS> | undefined>> = {
  [NODE_ADD_ERROR.LinkRequired]: 'error.linkRequired',
  [NODE_LINK_ERROR.Scheme]: 'error.link.scheme',
  [NODE_LINK_ERROR.Malformed]: 'error.link.malformed',
  [NODE_LINK_ERROR.Server]: 'error.link.server',
  [NODE_LINK_ERROR.Credential]: 'error.link.credential',
  [NODE_LINK_ERROR.Transport]: 'error.link.transport',
};

/**
 * Outbound from a provider's share link: the node goes into the draft the same
 * way as one added by type, with the tag from the link name. A newcomer has the
 * link, not the UUID, flow and Reality key separately.
 */
export function ConfigNodeAddLink({
  section,
  takenTags,
  onAdded,
}: {
  section: GenericSection;
  takenTags: readonly string[];
  onAdded?: (tag: string) => void;
}) {
  const { t } = useTranslation(NS);
  const insertNode = useNodeInsert(section);
  const id = useId();
  const hintId = useId();
  const errorId = useId();

  const form = useForm<NodeLinkModel>({
    defaultValues: NODE_LINK_DEFAULTS,
    mode: 'onSubmit',
    resolver: zodResolver(NodeLinkFormSchema),
  });

  const onSubmit = form.handleSubmit((data) => {
    const { link } = parseShareLink(data.link);

    if (link === null) {
      return;
    }

    const tag = shareLinkTag(link, takenTags);

    insertNode(shareLinkNode(link, tag));
    form.reset(NODE_LINK_DEFAULTS);
    onAdded?.(tag);
  });

  return (
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

          return (
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={id}>{t('field.link.label')}</Label>
              <Textarea
                id={id}
                value={field.value}
                placeholder={t('field.link.placeholder')}
                autoComplete='off'
                spellCheck={false}
                className='min-h-20 font-mono text-xs break-all'
                aria-invalid={fieldState.invalid}
                aria-describedby={error === null ? hintId : `${hintId} ${errorId}`}
                onBlur={field.onBlur}
                onChange={field.onChange}
              />
              <p id={hintId} className='text-xs text-pretty text-muted-foreground'>
                {t('field.link.hint')}
              </p>
              {error !== null && (
                <p id={errorId} role='alert' className='text-xs text-pretty text-destructive'>
                  {error}
                </p>
              )}
            </div>
          );
        }}
      />

      <Button type='submit' className='self-start'>
        {t('submitLink')}
      </Button>
    </form>
  );
}
