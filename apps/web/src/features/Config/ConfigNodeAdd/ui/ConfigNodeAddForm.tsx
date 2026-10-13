import { zodResolver } from '@hookform/resolvers/zod';
import type { TFunction } from 'i18next';
import { useId, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  ConfigDocumentState,
  newSectionNode,
  readSectionNodes,
  registryOfSection,
  sectionNodePath,
  type GenericSection,
  type NodeRegistry,
} from '@entities/Config';
import { nodePreset } from '@features/Config/ConfigNodeForm/@x/ConfigNodeAdd';
import { Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import { nodeTypeOptions } from '../model/ConfigNodeAdd.model';
import { makeNodeAddSchema, NODE_ADD_DEFAULTS, NODE_ADD_ERROR, type NodeAddModel } from '../model/ConfigNodeAdd.schema';

const NS = 'features/Config/ConfigNodeAdd';

/**
 * A new node of a section with a type registry: type and tag. Other fields are
 * optional by the schema and are edited by the node form; the add form does not
 * append them, otherwise the diff would contain values the user did not set.
 * The exception is a type override template: it fills in what the type cannot
 * be built without (VLESS with Reality without uTLS is not created by the fork
 * client).
 *
 * `takenTags` are tags the new node may not repeat; `builtTags` is the binary
 * build contents, `null` means not read.
 */
export function ConfigNodeAddForm({
  section,
  takenTags,
  builtTags,
  onAdded,
}: {
  section: GenericSection;
  takenTags: readonly string[];
  builtTags: readonly string[] | null;
  /** The node went into the draft: its tag. */
  onAdded?: (tag: string) => void;
}) {
  const registry = registryOfSection(section);

  if (registry === null) {
    return null;
  }

  return (
    <NodeAddForm section={section} registry={registry} takenTags={takenTags} builtTags={builtTags} onAdded={onAdded} />
  );
}

function NodeAddForm({
  section,
  registry,
  takenTags,
  builtTags,
  onAdded,
}: {
  section: GenericSection;
  registry: NodeRegistry;
  takenTags: readonly string[];
  builtTags: readonly string[] | null;
  onAdded?: (tag: string) => void;
}) {
  const { t } = useTranslation(NS);
  const insert = ConfigDocumentState.use.insert();
  const options = useMemo(() => nodeTypeOptions(registry, builtTags), [registry, builtTags]);
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
    // The position is taken from the text at the moment of writing: an insert
    // at the end of the section, and an array missing from the file is created
    // by the insert.
    const count = readSectionNodes(ConfigDocumentState.getState().current() ?? '{}', section).length;

    insert(sectionNodePath(section, count), nodePreset(registry, data.type, tag, newSectionNode));
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
          const error = errorText(t, fieldState.error?.message);
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
                  className='w-full font-mono'
                  aria-invalid={fieldState.invalid}
                  aria-describedby={describedBy === '' ? undefined : describedBy}
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder={t('field.type.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.type} value={option.type} className='font-mono'>
                      {option.type}
                      {option.unbuilt !== null && (
                        <Badge variant='outline' className='font-sans'>
                          {t('unbuilt.badge', { tag: option.unbuilt })}
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          const error = errorText(t, fieldState.error?.message);

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

      <Button type='submit' className='self-start'>
        {t('submit')}
      </Button>
    </form>
  );
}

/** Schema failure code into text; an unrecognized string is named as itself. */
function errorText(t: TFunction<typeof NS>, error: string | undefined): string | null {
  switch (error) {
    case undefined:
      return null;
    case NODE_ADD_ERROR.TypeRequired:
      return t('error.typeRequired');
    case NODE_ADD_ERROR.TagRequired:
      return t('error.tagRequired');
    case NODE_ADD_ERROR.TagTaken:
      return t('error.tagTaken');
    default:
      return error;
  }
}
