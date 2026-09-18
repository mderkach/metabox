import { zodResolver } from '@hookform/resolvers/zod';
import type { TFunction } from 'i18next';
import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, RULE_SETS_PATH } from '@entities/Config';
import { defaultFormatOf, filterCategories, findProvider, RULE_SET_PROVIDERS } from '@entities/RuleSet';
import { FACET_CLASS, FACET_IDLE, SECTION_LABEL } from '@shared/lib/styles';
import { cn } from '@shared/lib/utils';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui';

import {
  CUSTOM_PROVIDER,
  RULE_SET_ADD_ERROR_KEY,
  RULE_SET_FORMAT_OPTIONS,
  VISIBLE_CATEGORIES,
} from '../model/RuleSetAdd.constants';
import {
  composeRuleSetTag,
  composeRuleSetURL,
  makeRuleSetAddSchema,
  ruleSetAddDefaults,
  toRuleSetPatch,
  type RuleSetAddModel,
} from '../model/RuleSetAdd.schema';

/**
 * Подключение готового набора.
 *
 * Якорь формы — собранный адрес: поставщик, зеркало и категория это лишь
 * способ его собрать, а в конфиг уходит он сам. Поэтому адрес показан целиком
 * и правится руками: вписанный адрес переводит форму в «свой источник», и
 * ни одна категория не оказывается недостижимой.
 */
export function RuleSetAddForm({ takenTags, onDone }: { takenTags: readonly string[]; onDone?: () => void }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const insert = ConfigDocumentState.use.insert();
  const count = takenTags.length;

  const form = useForm<RuleSetAddModel>({
    defaultValues: ruleSetAddDefaults(),
    mode: 'onSubmit',
    resolver: zodResolver(makeRuleSetAddSchema(takenTags)),
  });

  const onSubmit = form.handleSubmit((data) => {
    insert([...RULE_SETS_PATH, count], toRuleSetPatch(data));
    form.reset(ruleSetAddDefaults());
    onDone?.();
  });

  return (
    <FormProvider {...form}>
      <form
        className='flex flex-col gap-4'
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <ProviderField />
        <CategoryField />
        <AddressField />
        <TagField />
        <FormatField />
        <ExtraFields />

        <div className='flex flex-wrap items-center gap-2'>
          <Button type='submit'>{t('submit')}</Button>
          {onDone !== undefined && (
            <Button type='button' variant='ghost' onClick={onDone}>
              {t('cancel')}
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}

/** Источник: поставщик из каталога или свой адрес. */
function ProviderField() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue, getValues } = useFormContext<RuleSetAddModel>();
  const id = useId();

  return (
    <Controller
      control={control}
      name='providerId'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('field.provider.label')}</Label>
          <Select
            value={field.value}
            onValueChange={(value: string | null) => {
              const next = value ?? CUSTOM_PROVIDER;
              field.onChange(next);

              const provider = findProvider(next);
              const mirrorId = provider === null ? '' : provider.mirrors[0].id;
              setValue('mirrorId', mirrorId);

              const category = getValues('category');
              setValue('url', composeRuleSetURL(next, mirrorId, category));
              setValue('tag', composeRuleSetTag(next, category));
            }}
          >
            <SelectTrigger id={id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_SET_PROVIDERS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_PROVIDER}>{t('field.provider.custom')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}

/**
 * Категория у поставщика. Подсказки — не каталог целиком, а часто спрашиваемое,
 * поэтому имя, которого в них нет, вводится тем же полем и собирается в адрес
 * тем же шаблоном.
 */
function CategoryField() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue, getValues } = useFormContext<RuleSetAddModel>();
  const providerId = useWatch({ control, name: 'providerId' });
  const category = useWatch({ control, name: 'category' });
  const id = useId();
  const provider = findProvider(providerId);

  if (provider === null) {
    return null;
  }

  const matches = filterCategories(provider, category);
  const shown = matches.slice(0, VISIBLE_CATEGORIES);
  const hidden = matches.length - shown.length;

  const pick = (next: string) => {
    setValue('category', next);
    setValue('url', composeRuleSetURL(providerId, getValues('mirrorId'), next));
    setValue('tag', composeRuleSetTag(providerId, next));
  };

  return (
    <Controller
      control={control}
      name='category'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('field.category.label')}</Label>
          <Input
            id={id}
            value={field.value}
            placeholder={t('field.category.placeholder')}
            autoComplete='off'
            spellCheck={false}
            className='font-mono'
            onChange={(event) => {
              pick(event.target.value);
            }}
          />

          {shown.length > 0 && (
            <ul aria-label={t('field.category.suggestions')} className='flex flex-wrap items-center gap-1.5 pt-0.5'>
              {shown.map((name) => (
                <li key={name}>
                  <button
                    type='button'
                    onClick={() => {
                      pick(name);
                    }}
                    className={cn(FACET_CLASS, FACET_IDLE, 'font-mono')}
                  >
                    {name}
                  </button>
                </li>
              ))}
              {hidden > 0 && (
                <li className='text-xs text-muted-foreground'>{t('field.category.more', { count: hidden })}</li>
              )}
            </ul>
          )}

          <p className='text-xs text-muted-foreground'>{t('field.category.hint')}</p>
        </div>
      )}
    />
  );
}

/**
 * Адрес и зеркало. Показан целиком: по нему видно, что именно уедет в конфиг,
 * а правка руками переводит форму в «свой источник» — угадывать поставщика по
 * чужому адресу панель не вправе.
 */
function AddressField() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue } = useFormContext<RuleSetAddModel>();
  const providerId = useWatch({ control, name: 'providerId' });
  const id = useId();
  const provider = findProvider(providerId);

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <Label htmlFor={id}>{t('field.url.label')}</Label>
        {provider !== null && provider.mirrors.length > 1 && <MirrorField />}
      </div>

      <Controller
        control={control}
        name='url'
        render={({ field, fieldState }) => (
          <>
            <Input
              id={id}
              value={field.value}
              placeholder={t('field.url.placeholder')}
              autoComplete='off'
              spellCheck={false}
              className='font-mono text-xs'
              aria-invalid={fieldState.error !== undefined}
              onChange={(event) => {
                field.onChange(event.target.value);
                setValue('providerId', CUSTOM_PROVIDER);
                setValue('mirrorId', '');
              }}
            />
            <FieldError message={fieldState.error?.message} />
          </>
        )}
      />
    </div>
  );
}

/** Зеркало поставщика: пересобирает адрес, не трогая остальную форму. */
function MirrorField() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue, getValues } = useFormContext<RuleSetAddModel>();
  const providerId = useWatch({ control, name: 'providerId' });
  const id = useId();
  const provider = findProvider(providerId);

  if (provider === null) {
    return null;
  }

  return (
    <Controller
      control={control}
      name='mirrorId'
      render={({ field }) => (
        <div className='flex items-center gap-2'>
          <Label htmlFor={id} className={SECTION_LABEL}>
            {t('field.mirror.label')}
          </Label>
          <Select
            value={field.value}
            onValueChange={(value: string | null) => {
              const next = value ?? provider.mirrors[0].id;
              field.onChange(next);
              setValue('url', composeRuleSetURL(providerId, next, getValues('category')));
            }}
          >
            <SelectTrigger id={id} size='sm' className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {provider.mirrors.map((mirror) => (
                <SelectItem key={mirror.id} value={mirror.id}>
                  {mirror.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}

/** Имя набора: по нему на него ссылаются правила, поэтому оно уникально. */
function TagField() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control } = useFormContext<RuleSetAddModel>();
  const id = useId();

  return (
    <Controller
      control={control}
      name='tag'
      render={({ field, fieldState }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('field.tag.label')}</Label>
          <Input
            id={id}
            value={field.value}
            onChange={field.onChange}
            placeholder={t('field.tag.placeholder')}
            autoComplete='off'
            spellCheck={false}
            className='font-mono'
            aria-invalid={fieldState.error !== undefined}
          />
          <FieldError message={fieldState.error?.message} />
        </div>
      )}
    />
  );
}

/**
 * Формат файла. Поле появляется только тогда, когда вывести его из адреса
 * нечем: у `.srs` и `.json` ядро выводит формат само, и записанное значение
 * оказалось бы правкой, которой пользователь не делал.
 */
function FormatField() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control } = useFormContext<RuleSetAddModel>();
  const url = useWatch({ control, name: 'url' });
  const id = useId();

  if (url.trim() === '' || defaultFormatOf(url.trim()) !== '') {
    return null;
  }

  return (
    <Controller
      control={control}
      name='format'
      render={({ field, fieldState }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('field.format.label')}</Label>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={t('field.format.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {RULE_SET_FORMAT_OPTIONS.map((format) => (
                <SelectItem key={format} value={format}>
                  {t(`format.${format}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='text-xs text-muted-foreground'>{t('field.format.hint')}</p>
          <FieldError message={fieldState.error?.message} />
        </div>
      )}
    />
  );
}

/**
 * Интервал обновления и узел для скачивания. Свёрнуты: оба нужны редко, а
 * развёрнутыми занимают половину формы на узком экране.
 */
function ExtraFields() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control } = useFormContext<RuleSetAddModel>();
  const [open, setOpen] = useState(false);
  const intervalId = useId();
  const detourId = useId();
  const panelId = useId();

  return (
    <div className='flex flex-col gap-3'>
      <button
        type='button'
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className='flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
      >
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        {t('extra.toggle')}
      </button>

      {open && (
        <div id={panelId} className='flex flex-col gap-3 border-l border-border pl-3.5'>
          <Controller
            control={control}
            name='updateInterval'
            render={({ field }) => (
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor={intervalId}>{t('field.interval.label')}</Label>
                <Input
                  id={intervalId}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('field.interval.placeholder')}
                  autoComplete='off'
                  className='font-mono'
                />
                <p className='text-xs text-muted-foreground'>{t('field.interval.hint')}</p>
              </div>
            )}
          />

          <Controller
            control={control}
            name='detour'
            render={({ field }) => (
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor={detourId}>{t('field.detour.label')}</Label>
                <Input
                  id={detourId}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('field.detour.placeholder')}
                  autoComplete='off'
                  className='font-mono'
                />
                <p className='text-xs text-muted-foreground'>{t('field.detour.hint')}</p>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const text = errorText(t, message);

  return text === null ? null : (
    <p role='alert' className='text-xs text-destructive'>
      {text}
    </p>
  );
}

/** Код отказа из схемы в текст: сообщение приходит строкой, ключи — свои. */
function errorText(t: TFunction<'features/RuleSet/RuleSetAdd'>, message: string | undefined): string | null {
  const key = message === undefined ? undefined : RULE_SET_ADD_ERROR_KEY[message];

  return key === undefined ? null : t(key);
}
