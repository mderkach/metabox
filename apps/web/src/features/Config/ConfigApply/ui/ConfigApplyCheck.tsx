import { CircleAlert } from 'lucide-react';

import type { CheckFailure } from '@entities/Config';
import { Alert, AlertDescription, AlertTitle } from '@shared/ui';

/** Вывод бинаря показывается дословно: арбитр валидности — он, а не панель (UX-4). */
export function ConfigApplyCheck({ check }: { check: CheckFailure }) {
  const output = [check.stderr, check.stdout].filter((part) => part.length > 0).join('\n');

  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>sing-box отверг конфиг — на устройство ничего не записано</AlertTitle>
      <AlertDescription>
        <pre className='font-mono text-xs whitespace-pre-wrap'>{output}</pre>
        <p className='text-xs'>Код выхода: {check.exitCode}. Черновик сохранён, правьте и применяйте снова.</p>
      </AlertDescription>
    </Alert>
  );
}
