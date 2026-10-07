import { X } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState } from '@entities/Config';
import type { RuleRow } from '@entities/Rule';
import { RuleEditForm } from '@features/Rule/RuleEdit';
import { RuleRawEditor } from '@features/Rule/RuleRaw';
import { useFocusReturn } from '@shared/lib/useFocusReturn';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  SECTION_HEADING,
  SECTION_LABEL,
  SURFACE,
  SURFACE_HEAD,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';

const BREAK_POINT = /(?=\.)|(?<=_)/;

const TAB = {
  Form: 'form',
  Raw: 'raw',
} as const;

/**
 * Панель правила: форма выхода и тот же узел текстом.
 *
 * Узел, который схема не приняла, формы не получает вовсе — он показывается
 * сырым блоком с пометкой и правится только текстом.
 *
 * `sheet` — панель стоит внутри листа поверх списка: рамку и фокус держит лист,
 * а заголовок панели становится его заголовком.
 */
export function RulePanel({
  id,
  rule,
  node,
  recognized,
  outbounds,
  ruleSets,
  actions = null,
  sheet = false,
  onClose,
}: {
  id?: string;
  rule: RuleRow;
  node: unknown;
  recognized: boolean;
  outbounds: string[];
  /** Теги наборов документа: из них форма выбирает сеты правила. */
  ruleSets: string[];
  /** Действия над правилом: шапка, перед кнопкой закрытия. */
  actions?: ReactNode;
  sheet?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/Rule/RulePanel');
  const [tab, setTab] = useState<string>(recognized ? TAB.Form : TAB.Raw);
  const revision = ConfigDocumentState.use.revision();
  // Форма читает узел однажды, а выбор держит позицию: отмена черновика или
  // правка текстом ставят на неё другой узел, и форма должна смениться вместе с
  // ним. Перестановка узел не меняет — набранное в форме остаётся.
  const nodeKey = useMemo(() => JSON.stringify(node), [node]);
  const headingRef = useFocusReturn<HTMLHeadingElement>();

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  return (
    // Escape закрывает панель: обработчик на контейнере — обычный паттерн для
    // панелей и диалогов, интерактивная роль aside для этого не нужна.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- см. выше
    <aside
      id={id}
      aria-label={t('title', { index: rule.index })}
      onKeyDown={onKeyDown}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        !sheet && ['w-full max-w-md shrink-0 max-lg:max-h-[70vh]', SURFACE]
      )}
    >
      <header className={cn('flex items-center gap-2.5', SURFACE_HEAD)}>
        <div className='flex min-w-0 grow flex-col'>
          {sheet ? (
            <SheetTitle className={SECTION_HEADING}>{t('title', { index: rule.index })}</SheetTitle>
          ) : (
            <h2
              ref={headingRef}
              tabIndex={-1}
              className={cn(
                '-mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                SECTION_HEADING
              )}
            >
              {t('title', { index: rule.index })}
            </h2>
          )}
          <p className='font-mono text-xs text-muted-foreground'>route.rules[{rule.index - 1}]</p>
        </div>
        {!recognized && <Badge variant='outline'>{t('rule.uncovered', { ns: 'shared' })}</Badge>}
        {actions !== null && <div className='flex shrink-0 items-center gap-0.5'>{actions}</div>}
        <Button
          variant='outline'
          size='icon-sm'
          aria-label={t('action.closePanel', { ns: 'shared' })}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <div className='flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4'>
        <RuleConditions rule={rule} />

        {!recognized && (
          <Alert>
            <AlertTitle>{t('unknown.title')}</AlertTitle>
            <AlertDescription>{t('unknown.description')}</AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant='line'>
            <TabsTrigger value={TAB.Form} disabled={!recognized}>
              {t('tab.form')}
            </TabsTrigger>
            <TabsTrigger value={TAB.Raw}>JSON</TabsTrigger>
          </TabsList>

          {/* Форма держит набранное, пока узел сверяют текстом: размонтирование его стирает. */}
          <TabsContent value={TAB.Form} keepMounted className='pt-3'>
            {recognized && <RuleEditForm key={nodeKey} rule={rule} outbounds={outbounds} ruleSets={ruleSets} />}
          </TabsContent>

          <TabsContent value={TAB.Raw} className='pt-3'>
            <RuleRawEditor key={revision} index={rule.index} node={node} />
          </TabsContent>
        </Tabs>

        <p className='text-xs text-muted-foreground'>{t('note')}</p>
      </div>
    </aside>
  );
}

/**
 * Места переноса перед точкой домена или адреса и после подчёркивания в имени
 * поля: браузер сам их там не видит и рвал бы длинное значение на произвольной
 * букве. Посреди части перенос остаётся только для части шире строки.
 */
function withBreaks(text: string): ReactNode[] {
  return text.split(BREAK_POINT).flatMap((part, index) => (index === 0 ? [part] : [<wbr key={index} />, part]));
}

/**
 * Условия правила только на чтение: из них форма правит одни сеты, остальные
 * правятся текстом узла. Значения показываются целиком, без свёртки в «и ещё N», — в отличие от
 * строки списка, где на них нет места.
 */
function RuleConditions({ rule }: { rule: RuleRow }) {
  const { t } = useTranslation('widgets/Rule/RulePanel');
  // Нераспознанный узел «без условий» не бывает: условие в нём есть, просто
  // схема не знает его поля, и показать его формой нечем.
  if (rule.isCatchAll && !rule.recognized) {
    return <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>{t('conditions.unknown')}</p>;
  }

  if (rule.isCatchAll) {
    return <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>{t('conditions.empty')}</p>;
  }

  if (rule.group !== null) {
    return (
      <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>
        {t('conditions.group', { mode: rule.group.mode })}
      </p>
    );
  }

  return (
    <section className='flex flex-col gap-1.5'>
      <h3 className={SECTION_LABEL}>{t('rule.conditions', { ns: 'shared' })}</h3>
      <dl className='flex flex-col gap-1'>
        {rule.matchers.map((matcher) => (
          <div key={matcher.key} className='flex gap-3 border-t border-border py-1.5 text-xs first:border-t-0'>
            <dt className='w-32 shrink-0 font-mono wrap-anywhere text-muted-foreground'>{withBreaks(matcher.key)}</dt>
            <dd className='min-w-0 grow font-mono wrap-anywhere'>
              <ul>
                {matcher.values.map((value, index) => (
                  <li key={index} className='inline'>
                    {withBreaks(value)}
                    {index < matcher.values.length - 1 && ', '}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
      {rule.invert && <p className='text-xs text-muted-foreground'>{t('conditions.inverted')}</p>}
    </section>
  );
}
