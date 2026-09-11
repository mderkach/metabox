import { Link } from '@tanstack/react-router';

import { ConfigDocumentState, useConfigDirty } from '@entities/Config';
import { useConfigPath } from '@entities/Daemon';
import { Alert, AlertDescription, AlertTitle, Badge, Button, buttonVariants } from '@shared/ui';
import { ConfigRawEditor } from '@widgets/Config/ConfigRawEditor';

import { useRawConfig } from '../lib/RawConfig.lib';

export function RawConfigPage() {
  const raw = useRawConfig();
  const configPath = useConfigPath();
  const replace = ConfigDocumentState.use.replace();
  const discard = ConfigDocumentState.use.discard();
  const isDirty = useConfigDirty();

  return (
    <>
      <header className='flex min-h-14 shrink-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border px-4 py-2.5 sm:px-6'>
        <h1 className='text-base font-medium'>Конфиг текстом</h1>
        <p className='font-mono text-xs text-muted-foreground'>{configPath}</p>
        {isDirty && <Badge variant='secondary'>черновик</Badge>}
        <span className='grow' />
        <Button variant='outline' size='sm' disabled={!isDirty} onClick={discard}>
          Вернуть как на устройстве
        </Button>
        <Link to='/config' className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          К формам
        </Link>
      </header>

      <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
        {raw.isPending && <p className='text-sm text-muted-foreground'>Загружаю конфиг…</p>}

        {raw.notParsed && (
          <Alert>
            <AlertTitle>Схема не приняла этот конфиг</AlertTitle>
            <AlertDescription>
              Формы по нему построить нельзя, а текстовый режим работает: это ровно тот случай, ради которого он и
              нужен. Файл на устройстве не тронут, пока не нажат «Применить».
            </AlertDescription>
          </Alert>
        )}

        {raw.text !== null && (
          <ConfigRawEditor key={raw.revision} text={raw.text} onChange={replace} issues={raw.issues} />
        )}
      </div>
    </>
  );
}
