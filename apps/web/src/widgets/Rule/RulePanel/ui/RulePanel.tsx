import { X } from 'lucide-react';
import { useState } from 'react';

import type { RuleRow } from '@entities/Rule';
import { RuleEditForm } from '@features/Rule/RuleEdit';
import { RuleRawEditor } from '@features/Rule/RuleRaw';
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
 * сырым блоком с пометкой и правится только текстом (AC-25, UX-3).
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
  const [tab, setTab] = useState<string>(recognized ? TAB.Form : TAB.Raw);

  return (
    <aside className='flex w-full max-w-md shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card'>
      <header className='flex items-center gap-2.5 border-b border-border px-4 py-3'>
        <div className='flex min-w-0 grow flex-col'>
          <h2 className='text-sm font-medium'>Правило {rule.index}</h2>
          <p className='font-mono text-xs text-muted-foreground'>route.rules[{rule.index - 1}]</p>
        </div>
        {!recognized && <Badge variant='outline'>UI не покрывает</Badge>}
        <Button variant='outline' size='icon-sm' aria-label='Закрыть панель' onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className='flex min-h-0 grow flex-col gap-3 overflow-y-auto p-4'>
        {!recognized && (
          <Alert>
            <AlertTitle>Схема этот узел не знает</AlertTitle>
            <AlertDescription>
              Форму по нему построить нельзя, но он сохраняется байт в байт и уезжает на устройство как есть. Такое
              бывает, когда бинарь на устройстве новее схемы панели: запретить то, что принимает бинарь, схема не
              вправе.
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant='line'>
            <TabsTrigger value={TAB.Form} disabled={!recognized}>
              Форма
            </TabsTrigger>
            <TabsTrigger value={TAB.Raw}>JSON</TabsTrigger>
          </TabsList>

          <TabsContent value={TAB.Form} className='pt-3'>
            {recognized && <RuleEditForm rule={rule} outbounds={outbounds} />}
          </TabsContent>

          <TabsContent value={TAB.Raw} className='pt-3'>
            <RuleRawEditor index={rule.index} node={node} />
          </TabsContent>
        </Tabs>

        <p className='text-xs text-muted-foreground'>
          Правка меняет одну строку файла: порядок ключей и незнакомые узлы остаются как были.
        </p>
      </div>
    </aside>
  );
}
