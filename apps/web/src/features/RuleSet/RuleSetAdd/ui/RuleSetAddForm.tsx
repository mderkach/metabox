import { zodResolver } from '@hookform/resolvers/zod';
import type { TFunction } from 'i18next';
import { ChevronDown, CircleCheck, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState, RULE_SETS_PATH } from '@entities/Config';
import {
  defaultFormatOf,
  filterCategories,
  findList,
  findProvider,
  isCatalogCategory,
  RULE_SET_LIST_SOURCE,
  type RuleSetCatalog,
  type RuleSetList,
} from '@entities/RuleSet';
import { formatDate } from '@shared/lib/format';
import { matchesWords, toQueryWords } from '@shared/lib/search';
import { cn } from '@shared/lib/utils';
import {
  Autocomplete,
  Button,
  FACET_ACTIVE,
  FACET_CLASS,
  FACET_IDLE,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from '@shared/ui';

import {
  CUSTOM_PROVIDER,
  RULE_SET_ADD_ERROR_KEY,
  RULE_SET_FORMAT_OPTIONS,
  SUGGESTION_LIMIT,
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
 * Якорь формы — собранный адрес: поставщик, вид списка, зеркало и категория
 * это лишь способ его собрать, а в конфиг уходит он сам. Поэтому адрес показан
 * целиком и правится руками: вписанный адрес переводит форму в «свой
 * источник», и ни одна категория не оказывается недостижимой.
 *
 * Каталог приходит от демона: он сверяет перечни с поставщиками сам.
 */
export function RuleSetAddForm({
  catalog,
  takenTags,
  outbounds,
  onDone,
}: {
  catalog: RuleSetCatalog;
  takenTags: readonly string[];
  /** Теги аутбаундов документа; пустой список — конфиг не разобран. */
  outbounds: readonly string[];
  onDone?: () => void;
}) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const insert = ConfigDocumentState.use.insert();
  const count = takenTags.length;
  // Форма, которая остаётся на экране, о своём успехе должна сказать: набор
  // уезжает в черновик, и без строки таблицы рядом это ничем не видно.
  const [added, setAdded] = useState<string | null>(null);

  const form = useForm<RuleSetAddModel>({
    defaultValues: ruleSetAddDefaults(catalog),
    mode: 'onTouched',
    resolver: zodResolver(makeRuleSetAddSchema(takenTags, outbounds)),
  });

  const onSubmit = form.handleSubmit((data) => {
    insert([...RULE_SETS_PATH, count], toRuleSetPatch(data));
    form.reset(ruleSetAddDefaults(catalog));
    setAdded(data.tag);
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
        <ProviderField catalog={catalog} />
        <KindField catalog={catalog} />
        <CategoryField catalog={catalog} />
        <AddressField catalog={catalog} />
        <TagField />
        <FormatField />
        <ExtraFields outbounds={outbounds} />

        <div className='flex flex-wrap items-center gap-2'>
          <Button type='submit'>{t('submit')}</Button>
          {onDone !== undefined && (
            <Button type='button' variant='ghost' onClick={onDone}>
              {t('action.cancel', { ns: 'shared' })}
            </Button>
          )}
        </div>

        {added !== null && onDone === undefined && (
          <p role='status' className='flex items-start gap-1.5 text-xs text-pretty text-signal-ok'>
            <CircleCheck className='mt-px size-3.5 shrink-0' aria-hidden='true' />
            <span>{t('added', { tag: added })}</span>
          </p>
        )}
      </form>
    </FormProvider>
  );
}

/** Выбранный в форме список каталога; `null` — свой адрес или такого вида у поставщика нет. */
function useSelectedList(catalog: RuleSetCatalog): RuleSetList | null {
  const { control } = useFormContext<RuleSetAddModel>();
  const providerId = useWatch({ control, name: 'providerId' });
  const kind = useWatch({ control, name: 'kind' });

  return findList(catalog, providerId, kind);
}

/**
 * Пересобирает адрес и имя под выбранные поставщика и вид списка. Зеркало
 * сохраняется, если у нового списка оно есть, иначе берётся первое.
 */
function useRecompose(catalog: RuleSetCatalog) {
  const { setValue, getValues } = useFormContext<RuleSetAddModel>();

  return (providerId: string, kind: string) => {
    const list = findList(catalog, providerId, kind);
    const mirrorId = getValues('mirrorId');
    const nextMirror = list?.mirrors.find((mirror) => mirror.id === mirrorId)?.id ?? list?.mirrors.at(0)?.id ?? '';
    const category = getValues('category');

    setValue('mirrorId', nextMirror);
    setValue('url', composeRuleSetURL(list, nextMirror, category));
    setValue('tag', composeRuleSetTag(list, category));
  };
}

/** Источник: поставщик из каталога или свой адрес. */
function ProviderField({ catalog }: { catalog: RuleSetCatalog }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue, getValues } = useFormContext<RuleSetAddModel>();
  const recompose = useRecompose(catalog);
  const id = useId();

  return (
    <Controller
      control={control}
      name='providerId'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('ruleSet.source', { ns: 'shared' })}</Label>
          <Select
            items={[
              ...catalog.providers.map((provider) => ({ value: provider.id, label: provider.name })),
              { value: CUSTOM_PROVIDER, label: t('ruleSet.ownSource', { ns: 'shared' }) },
            ]}
            value={field.value}
            onValueChange={(value: string | null) => {
              const next = value ?? CUSTOM_PROVIDER;
              field.onChange(next);

              // Вид списка переносится, если он есть у нового поставщика:
              // сменивший источник обычно ищет ту же категорию у другого.
              const lists = findProvider(catalog, next)?.lists ?? [];
              const kind = getValues('kind');
              const nextKind = lists.some((list) => list.kind === kind) ? kind : (lists.at(0)?.kind ?? kind);
              setValue('kind', nextKind);
              recompose(next, nextKind);
            }}
          >
            <SelectTrigger id={id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {catalog.providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_PROVIDER}>{t('ruleSet.ownSource', { ns: 'shared' })}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}

/**
 * Вид списка: домены или адреса. Отдельно от поставщика, потому что это два
 * разных вопроса — чьему списку доверять и что в нём искать.
 */
function KindField({ catalog }: { catalog: RuleSetCatalog }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control } = useFormContext<RuleSetAddModel>();
  const providerId = useWatch({ control, name: 'providerId' });
  const recompose = useRecompose(catalog);
  const labelId = useId();
  const lists = findProvider(catalog, providerId)?.lists ?? [];

  if (lists.length === 0) {
    return null;
  }

  return (
    <Controller
      control={control}
      name='kind'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <span id={labelId} className='text-sm leading-none font-medium'>
            {t('field.kind.label')}
          </span>
          <ToggleGroup
            aria-labelledby={labelId}
            spacing={1.5}
            value={[field.value]}
            onValueChange={(value) => {
              const next = lists.find((list) => list.kind === value[0])?.kind;

              // Повторное нажатие на отмеченный вид снимает его, а без вида
              // адрес не собрать.
              if (next === undefined) {
                return;
              }

              field.onChange(next);
              recompose(providerId, next);
            }}
            className='w-fit'
          >
            {lists.map((list) => (
              <ToggleGroupItem
                key={list.kind}
                value={list.kind}
                className={cn(FACET_CLASS, field.value === list.kind ? FACET_ACTIVE : FACET_IDLE)}
              >
                {t(`kind.${list.kind}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    />
  );
}

/**
 * Категория у поставщика. Подсказки берутся из перечня, который сверяет демон,
 * но имя, которого в нём нет, вводится тем же полем и собирается в адрес тем же
 * шаблоном: поставщик мог добавить категорию после сверки.
 */
function CategoryField({ catalog }: { catalog: RuleSetCatalog }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue, getValues } = useFormContext<RuleSetAddModel>();
  const category = useWatch({ control, name: 'category' });
  const list = useSelectedList(catalog);
  const id = useId();
  const hintId = useId();

  if (list === null) {
    return null;
  }

  const suggestions = filterCategories(list, category).slice(0, SUGGESTION_LIMIT);

  const pick = (next: string) => {
    setValue('category', next);
    setValue('url', composeRuleSetURL(list, getValues('mirrorId'), next));
    setValue('tag', composeRuleSetTag(list, next));
  };

  return (
    <Controller
      control={control}
      name='category'
      render={({ field }) => (
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor={id}>{t('field.category.label')}</Label>
          <Autocomplete
            id={id}
            items={suggestions}
            value={field.value}
            onValueChange={pick}
            placeholder={t('field.category.placeholder')}
            autoComplete='off'
            spellCheck={false}
            className='font-mono'
            listClassName='font-mono'
            aria-describedby={hintId}
          />
          <p id={hintId} className='text-xs text-pretty text-muted-foreground'>
            {listFreshness(t, list)} {t('field.category.hint')}
          </p>
        </div>
      )}
    />
  );
}

/** Откуда перечень и какой он свежести: пользователь судит по этому, можно ли верить подсказкам. */
function listFreshness(t: TFunction<'features/RuleSet/RuleSetAdd'>, list: RuleSetList): string {
  if (list.updatedAt === null) {
    return t('field.category.undated');
  }

  const date = formatDate(list.updatedAt);

  return list.source === RULE_SET_LIST_SOURCE.Provider
    ? t('field.category.checked', { date })
    : t('field.category.snapshot', { date });
}

/**
 * Адрес и зеркало. Показан целиком: по нему видно, что именно уедет в конфиг,
 * а правка руками переводит форму в «свой источник» — угадывать поставщика по
 * чужому адресу панель не вправе.
 */
function AddressField({ catalog }: { catalog: RuleSetCatalog }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue } = useFormContext<RuleSetAddModel>();
  const list = useSelectedList(catalog);
  const id = useId();
  const errorId = useId();

  return (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{t('field.url.label')}</Label>

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
              aria-describedby={fieldState.error === undefined ? undefined : errorId}
              onChange={(event) => {
                field.onChange(event.target.value);
                setValue('providerId', CUSTOM_PROVIDER);
                setValue('mirrorId', '');
              }}
            />
            <FieldError id={errorId} message={fieldState.error?.message} />
          </>
        )}
      />

      {list !== null && list.mirrors.length > 1 && <MirrorField list={list} />}

      <CategoryNotice list={list} />
    </div>
  );
}

/**
 * Категория вне перечня. Не отказ: поставщик мог добавить её после сверки.
 * Предупреждение называет последствие, потому что проверить адрес панель не
 * может — это сделает бинарь при применении.
 */
function CategoryNotice({ list }: { list: RuleSetList | null }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control } = useFormContext<RuleSetAddModel>();
  const category = useWatch({ control, name: 'category' }).trim();

  if (list === null || category === '' || isCatalogCategory(list, category)) {
    return null;
  }

  return (
    <p role='status' className='flex items-start gap-1.5 text-xs text-pretty text-signal-warn'>
      <TriangleAlert className='mt-px size-3.5 shrink-0' aria-hidden='true' />
      <span>{t('field.category.offCatalog')}</span>
    </p>
  );
}

/** Зеркало поставщика: пересобирает адрес, не трогая остальную форму. */
function MirrorField({ list }: { list: RuleSetList }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, setValue, getValues } = useFormContext<RuleSetAddModel>();
  const id = useId();

  return (
    <Controller
      control={control}
      name='mirrorId'
      render={({ field }) => (
        <div className='flex items-center gap-2'>
          <Label htmlFor={id}>{t('field.mirror.label')}</Label>
          <Select
            items={list.mirrors.map((mirror) => ({ value: mirror.id, label: mirror.name }))}
            value={field.value}
            onValueChange={(value: string | null) => {
              const next = value ?? list.mirrors[0].id;
              field.onChange(next);
              setValue('url', composeRuleSetURL(list, next, getValues('category')));
            }}
          >
            <SelectTrigger id={id} size='sm' className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {list.mirrors.map((mirror) => (
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
export function TagField() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control } = useFormContext<RuleSetAddModel>();
  const id = useId();
  const errorId = useId();

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
            aria-describedby={fieldState.error === undefined ? undefined : errorId}
          />
          <FieldError id={errorId} message={fieldState.error?.message} />
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
export function FormatField() {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control } = useFormContext<RuleSetAddModel>();
  const url = useWatch({ control, name: 'url' });
  const id = useId();
  const hintId = useId();
  const errorId = useId();

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
          <Select
            items={RULE_SET_FORMAT_OPTIONS.map((format) => ({ value: format, label: t(`format.${format}`) }))}
            value={field.value}
            onValueChange={field.onChange}
          >
            <SelectTrigger
              id={id}
              aria-describedby={describedBy(hintId, fieldState.error === undefined ? undefined : errorId)}
            >
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
          <p id={hintId} className='text-xs text-muted-foreground'>
            {t('field.format.hint')}
          </p>
          <FieldError id={errorId} message={fieldState.error?.message} />
        </div>
      )}
    />
  );
}

/**
 * Интервал обновления и узел для скачивания. Свёрнуты: оба нужны редко, а
 * развёрнутыми занимают половину формы на узком экране. Отказ на любом из них
 * раскрывает блок принудительно — иначе сообщение осталось бы под свёрткой.
 */
export function ExtraFields({ outbounds }: { outbounds: readonly string[] }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const { control, formState } = useFormContext<RuleSetAddModel>();
  const [open, setOpen] = useState(false);
  const intervalId = useId();
  const intervalHintId = useId();
  const intervalErrorId = useId();
  const detourId = useId();
  const detourHintId = useId();
  const detourErrorId = useId();
  const panelId = useId();

  const rejected = formState.errors.updateInterval !== undefined || formState.errors.detour !== undefined;
  const expanded = open || rejected;

  return (
    <div className='flex flex-col gap-3'>
      <button
        type='button'
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className='flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
      >
        <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
        {t('extra.toggle')}
      </button>

      {expanded && (
        <div id={panelId} className='flex flex-col gap-3 border-l border-border pl-3.5'>
          <Controller
            control={control}
            name='updateInterval'
            render={({ field, fieldState }) => (
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor={intervalId}>{t('field.interval.label')}</Label>
                <Input
                  id={intervalId}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('field.interval.placeholder')}
                  autoComplete='off'
                  className='font-mono'
                  aria-invalid={fieldState.error !== undefined}
                  aria-describedby={describedBy(
                    intervalHintId,
                    fieldState.error === undefined ? undefined : intervalErrorId
                  )}
                />
                <p id={intervalHintId} className='text-xs text-muted-foreground'>
                  {t('field.interval.hint')}
                </p>
                <FieldError id={intervalErrorId} message={fieldState.error?.message} />
              </div>
            )}
          />

          <Controller
            control={control}
            name='detour'
            render={({ field, fieldState }) => (
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor={detourId}>{t('field.detour.label')}</Label>
                <Autocomplete
                  id={detourId}
                  items={matchOutbounds(outbounds, field.value)}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder={t('field.detour.placeholder')}
                  autoComplete='off'
                  spellCheck={false}
                  className='font-mono'
                  listClassName='font-mono'
                  aria-invalid={fieldState.error !== undefined}
                  aria-describedby={describedBy(
                    detourHintId,
                    fieldState.error === undefined ? undefined : detourErrorId
                  )}
                />
                <p id={detourHintId} className='text-xs text-muted-foreground'>
                  {t('field.detour.hint')}
                </p>
                <FieldError id={detourErrorId} message={fieldState.error?.message} />
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}

/** Узлы, подходящие под набранное: подсказка сужается так же, как поиск по спискам панели. */
function matchOutbounds(outbounds: readonly string[], query: string): string[] {
  const words = toQueryWords(query);

  return outbounds.filter((tag) => matchesWords(tag.toLowerCase(), words)).slice(0, SUGGESTION_LIMIT);
}

/** Описания поля одной строкой: `aria-describedby` принимает идентификаторы через пробел. */
function describedBy(...ids: (string | undefined)[]): string | undefined {
  const list = ids.filter((id) => id !== undefined);

  return list.length === 0 ? undefined : list.join(' ');
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  const { t } = useTranslation('features/RuleSet/RuleSetAdd');
  const text = errorText(t, message);

  return text === null ? null : (
    <p id={id} role='alert' className='text-xs text-destructive'>
      {text}
    </p>
  );
}

/** Код отказа из схемы в текст: сообщение приходит строкой, ключи — свои. */
function errorText(t: TFunction<'features/RuleSet/RuleSetAdd'>, message: string | undefined): string | null {
  const key = message === undefined ? undefined : RULE_SET_ADD_ERROR_KEY[message];

  return key === undefined ? null : t(key);
}
