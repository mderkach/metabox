import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfigDocumentState } from '@entities/Config';
import type { RuleRow } from '@entities/Rule';
import { RuleEditForm } from '@features/Rule/RuleEdit';
import { RuleRawEditor } from '@features/Rule/RuleRaw';
import { SECTION_LABEL } from '@shared/lib/styles';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui';

const TAB = {
  Form: 'form',
  Raw: 'raw',
} as const;

/**
 * Панель правила: форма исхода и тот же узел текстом.
 *
 * Узел, который схема не приняла, формы не получает вовсе — он показывается
 * сырым блоком с пометкой и правится только текстом.
 */
export function RulePanel({
  rule,
  node,
  recognized,
  outbounds,
  onClose,
}: {
  rule: RuleRow;
  node: unknown;
  recognized: boolean;
  outbounds: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/Rule/RulePanel');
  const [tab, setTab] = useState<string>(recognized ? TAB.Form : TAB.Raw);
  const revision = ConfigDocumentState.use.revision();

  return (
    <aside className='flex w-full max-w-md shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card'>
      <header className='flex items-center gap-2.5 border-b border-border px-4 py-3'>
        <div className='flex min-w-0 grow flex-col'>
          <h2 className='text-sm font-medium'>{t('title', { index: rule.index })}</h2>
          <p className='font-mono text-xs text-muted-foreground'>route.rules[{rule.index - 1}]</p>
        </div>
        {!recognized && <Badge variant='outline'>{t('uncovered')}</Badge>}
        <Button variant='outline' size='icon-sm' aria-label={t('close')} onClick={onClose}>
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

          <TabsContent value={TAB.Form} className='pt-3'>
            {recognized && <RuleEditForm rule={rule} outbounds={outbounds} />}
          </TabsContent>

          <TabsContent value={TAB.Raw} className='pt-3'>
            {/* Обновление документа не от пользователя — загрузка с устройства,
                отмена правок, подтверждённое применение — пересоздаёт редактор:
                иначе в поле остаётся текст, которого в конфиге уже нет. */}
            <RuleRawEditor key={revision} index={rule.index} node={node} />
          </TabsContent>
        </Tabs>

        <p className='text-xs text-muted-foreground'>{t('note')}</p>
      </div>
    </aside>
  );
}

/**
 * Условия правила только на чтение: форма правит исход, а не условия.
 * Значения показываются целиком, без свёртки в «и ещё N», — в отличие от
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
      <h3 className={SECTION_LABEL}>{t('conditions.title')}</h3>
      <dl className='flex flex-col gap-1'>
        {rule.matchers.map((matcher) => (
          <div key={matcher.key} className='flex gap-3 border-t border-border py-1.5 text-xs first:border-t-0'>
            <dt className='w-32 shrink-0 truncate font-mono text-muted-foreground'>{matcher.key}</dt>
            <dd className='min-w-0 grow font-mono break-all'>{matcher.values.join(', ')}</dd>
          </div>
        ))}
      </dl>
      {rule.invert && <p className='text-xs text-muted-foreground'>{t('conditions.inverted')}</p>}
    </section>
  );
}
