import { Link, useSearch } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { useConfigPath } from '@entities/Daemon';
import { ConfigApplyHistory } from '@features/Config/ConfigApply';
import { RuleSchema } from '@shared/api/generated';
import { Badge, buttonVariants } from '@shared/ui';
import { ConfigTabs } from '@widgets/Config/ConfigTabs';
import { RulePanel } from '@widgets/Rule/RulePanel';
import { RuleTable } from '@widgets/Rule/RuleTable';

import { toSelectedRuleId, useRouteEditor } from '../lib/Editor.lib';

/** Сколько замечаний схемы показывать, чтобы они не вытеснили экран. */
const VISIBLE_ISSUES = 5;

export function EditorPage() {
  const editor = useRouteEditor();
  const configPath = useConfigPath();
  // Номер правила из адреса — начальный выбор: экран соединений ведёт сюда на
  // сработавший узел. Дальше выбором владеет сам экран, иначе закрытая панель
  // открывалась бы заново на каждый рендер.
  const { rule } = useSearch({ strict: false });
  const [selectedId, setSelectedId] = useState<string | null>(() => toSelectedRuleId(rule));

  const onSelect = useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  }, []);

  const onClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const selected = editor.rules.find((rule) => rule.id === selectedId) ?? null;
  const selectedNode = selected === null ? null : editor.nodes[selected.index - 1];

  return (
    <>
      <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border px-4 py-2.5 sm:px-6'>
        <h1 className='text-base font-medium'>Конфигурация</h1>
        <p className='font-mono text-xs text-muted-foreground'>{configPath}</p>
        {editor.isDirty && <Badge variant='secondary'>черновик</Badge>}
        <span className='grow' />
        <ConfigApplyHistory />
        <Link to='/config/raw' className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Весь конфиг текстом
        </Link>
      </header>

      <ConfigTabs config={editor.config} />

      <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
        <p className='rounded-xl bg-muted px-3.5 py-3 text-sm text-pretty text-muted-foreground'>
          Правила проверяются{' '}
          <span className='font-medium text-foreground'>сверху вниз, срабатывает первое подходящее</span> — не самое
          точное. Правило ниже уже сработавшего никогда не выполнится, поэтому порядок здесь и есть логика.
        </p>

        {editor.isPending && <p className='text-sm text-muted-foreground'>Загружаю конфиг…</p>}

        {editor.issues.length > 0 && <ConfigNotParsed issues={editor.issues} />}

        {editor.rules.length > 0 && (
          <div className='flex min-h-0 grow flex-col gap-4 lg:flex-row'>
            <RuleTable rules={editor.rules} selectedId={selectedId} onSelect={onSelect} />

            {selected !== null && (
              <RulePanel
                key={selected.id}
                rule={selected}
                node={selectedNode}
                recognized={RuleSchema.safeParse(selectedNode).success}
                outbounds={editor.outbounds}
                onClose={onClose}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Конфиг пришёл, но схема его не приняла.
 *
 * Пустой список правил вместо этого сообщения читался бы как «правил нет», и
 * пользователь начал бы чинить не то. Замечания схемы показываются дословно:
 * по ним видно, какой узел не разобран.
 */
function ConfigNotParsed({ issues }: { issues: string[] }) {
  const shown = issues.slice(0, VISIBLE_ISSUES);
  const hidden = issues.length - shown.length;

  return (
    <div className='rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive'>
      <p className='font-medium'>Конфиг не разобран по схеме</p>
      <p className='mt-1 text-pretty'>
        Файл на устройстве не тронут. Правила показать нельзя — сначала нужно понять, что в нём не так.
      </p>
      <ul className='mt-2 flex flex-col gap-1 font-mono text-xs'>
        {shown.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      {hidden > 0 && <p className='mt-1 text-xs'>и ещё {hidden} замечаний схемы</p>}
    </div>
  );
}
