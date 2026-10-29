import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { newSectionNode, type GenericSection, type NodeRegistry } from '@entities/Config';
import { nodePreset } from '@features/Config/ConfigNodeForm/@x/ConfigNodeAdd';
import { showQueryError } from '@shared/api';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@shared/ui';

import { nodeAddErrorText } from '../model/ConfigNodeAdd.errors';
import { useNodeInsert } from '../model/ConfigNodeAdd.insert';
import { nodeTypeDocsUrl, nodeTypeOptions, nodeTypeSections } from '../model/ConfigNodeAdd.model';
import { makeNodeAddSchema, NODE_ADD_DEFAULTS, type NodeAddModel } from '../model/ConfigNodeAdd.schema';
import { ConfigNodeAddDocsLink } from './ConfigNodeAddDocsLink';
import { ConfigNodeAddTypeItem } from './ConfigNodeAddTypeItem';

const NS = 'features/Config/ConfigNodeAdd';

/** Type and tag of a new node, chosen by hand. */
export function ConfigNodeAddManual({
  section,
  registry,
  takenTags,
  builtTags,
  secondary = false,
  onAdded,
}: {
  section: GenericSection;
  registry: NodeRegistry;
  takenTags: readonly string[];
  builtTags: readonly string[] | null;
  /** Another way to add stands above it: its submit is not the main action then. */
  secondary?: boolean;
  onAdded?: (tag: string) => void;
}) {
  const { t } = useTranslation(NS);
  const insertNode = useNodeInsert(section);
  const options = useMemo(() => nodeTypeOptions(registry, builtTags), [registry, builtTags]);
  const sections = useMemo(() => nodeTypeSections(options, registry), [options, registry]);
  const typeId = useId();
  const typeErrorId = useId();
  const typeHintId = useId();
  const tagId = useId();
  const tagHintId = useId();
  const tagErrorId = useId();

  const form = useForm<NodeAddModel>({
    defaultValues: NODE_ADD_DEFAULTS,
    mode: 'onTouched',
    resolver: zodResolver(makeNodeAddSchema(takenTags)),
  });

  const onSubmit = form.handleSubmit((data) => {
    const tag = data.tag.trim();

    if (!insertNode(nodePreset(registry, data.type, tag, newSectionNode))) {
      showQueryError({ showError: true, errorMessageKey: 'toast.config.edit.failed' }, null);

      return;
    }
    form.reset(NODE_ADD_DEFAULTS);
    onAdded?.(tag);
  });

  return (
    <form
      noValidate
      className='flex flex-col gap-4'
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <Controller
        control={form.control}
        name='type'
        render={({ field, fieldState }) => {
          const unbuilt = options.find((option) => option.type === field.value)?.unbuilt ?? null;
          const docsUrl = nodeTypeDocsUrl(registry, field.value);
          const error = nodeAddErrorText(t, fieldState.error?.message);
          const describedBy = [unbuilt === null ? null : typeHintId, error === null ? null : typeErrorId]
            .filter((id) => id !== null)
            .join(' ');

          return (
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={typeId}>{t('field.type.label')}</Label>
              <Select
                items={options.map((option) => ({ value: option.type, label: option.type }))}
                value={field.value === '' ? null : field.value}
                onValueChange={(value: string | null) => {
                  field.onChange(value ?? '');
                }}
              >
                <SelectTrigger
                  id={typeId}
                  className='w-full font-mono data-placeholder:font-sans'
                  aria-invalid={fieldState.invalid}
                  aria-describedby={describedBy === '' ? undefined : describedBy}
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder={t('field.type.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((typeSection) => (
                    <SelectGroup key={typeSection.group ?? ''}>
                      {typeSection.group !== null && <SelectLabel>{t(`group.${typeSection.group}`)}</SelectLabel>}
                      {typeSection.options.map((option) => (
                        <ConfigNodeAddTypeItem key={option.type} option={option} />
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {docsUrl !== null && <ConfigNodeAddDocsLink type={field.value} url={docsUrl} />}
              {unbuilt !== null && (
                <p id={typeHintId} className='text-xs text-pretty text-signal-warn'>
                  {t('unbuilt.hint', { tag: unbuilt })}
                </p>
              )}
              {error !== null && (
                <p id={typeErrorId} role='alert' className='text-xs text-destructive'>
                  {error}
                </p>
              )}
            </div>
          );
        }}
      />

      <Controller
        control={form.control}
        name='tag'
        render={({ field, fieldState }) => {
          const error = nodeAddErrorText(t, fieldState.error?.message);

          return (
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={tagId}>{t('field.tag.label')}</Label>
              <Input
                id={tagId}
                value={field.value}
                autoComplete='off'
                spellCheck={false}
                className='font-mono'
                aria-invalid={fieldState.invalid}
                aria-describedby={error === null ? tagHintId : `${tagHintId} ${tagErrorId}`}
                onBlur={field.onBlur}
                onChange={field.onChange}
              />
              <p id={tagHintId} className='text-xs text-pretty text-muted-foreground'>
                {t('field.tag.hint')}
              </p>
              {error !== null && (
                <p id={tagErrorId} role='alert' className='text-xs text-destructive'>
                  {error}
                </p>
              )}
            </div>
          );
        }}
      />

      <Button type='submit' variant={secondary ? 'outline' : 'default'} className='self-start'>
        {t('submit')}
      </Button>
    </form>
  );
}
