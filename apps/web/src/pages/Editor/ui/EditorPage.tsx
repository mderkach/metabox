import { AppSidebar } from '@widgets/AppSidebar';
import { ConfigTabs } from '@widgets/ConfigTabs';
import { RuleTable } from '@widgets/RuleTable';

import { useRouteEditor } from '../lib/Editor.lib';

/** Путь к файлу, которым владеет демон (`-config-dir` и `-config-name`). */
const CONFIG_PATH = '/etc/sing-box/config.json';

/** Сколько замечаний схемы показывать, чтобы они не вытеснили экран. */
const VISIBLE_ISSUES = 5;

export function EditorPage() {
  const editor = useRouteEditor();

  return (
    <div className='flex h-full bg-background text-foreground'>
      <AppSidebar />

      <div className='flex min-w-0 grow flex-col'>
        <header className='flex h-14 shrink-0 items-baseline gap-2.5 border-b border-border px-6'>
          <span className='text-base font-medium'>Конфигурация</span>
          <span className='font-mono text-xs text-muted-foreground'>{CONFIG_PATH}</span>
        </header>

        <ConfigTabs config={editor.config} />

        <div className='flex min-h-0 grow flex-col gap-4 px-6 py-5'>
          <p className='rounded-xl bg-muted px-3.5 py-3 text-sm text-pretty text-muted-foreground'>
            Правила проверяются{' '}
            <span className='font-medium text-foreground'>сверху вниз, срабатывает первое подходящее</span> — не самое
            точное. Правило ниже уже сработавшего никогда не выполнится, поэтому порядок здесь и есть логика.
          </p>

          {editor.isPending && <p className='text-sm text-muted-foreground'>Загружаю конфиг…</p>}

          {editor.issues.length > 0 && <ConfigNotParsed issues={editor.issues} />}

          {editor.config !== null && <RuleTable rules={editor.rules} final={editor.final} />}
        </div>
      </div>
    </div>
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
