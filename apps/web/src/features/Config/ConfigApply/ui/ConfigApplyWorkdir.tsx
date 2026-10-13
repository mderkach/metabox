import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { WorkdirMismatch } from '@entities/Config';
import { Alert, AlertDescription, AlertTitle } from '@shared/ui';

/**
 * The service working directory is set by the `workdir` UCI option of the
 * sing-box package for OpenWrt: the init script passes it with the `-D` flag.
 * Without a restart procd keeps the previous command, and a repeated apply
 * would hit the same failure.
 */
const UCI_WORKDIR = 'sing-box.main.workdir';
const UCI_COMMIT = 'uci commit sing-box && /etc/init.d/sing-box restart';

/** The path goes into the shell as one word: a space or a metacharacter in it will not split the command. */
function toShellWord(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The command is built from the directory named by the daemon: the panel does not invent the config path. */
export function ConfigApplyWorkdir({ mismatch }: { mismatch: WorkdirMismatch }) {
  const { t } = useTranslation('features/Config/ConfigApply');

  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>{t('workdir.title')}</AlertTitle>
      <AlertDescription>
        <p>{t('workdir.description', { workdir: mismatch.workdir, configDir: mismatch.configDir })}</p>
        <pre className='font-mono text-xs whitespace-pre-wrap'>
          {`uci set ${UCI_WORKDIR}=${toShellWord(mismatch.configDir)} && ${UCI_COMMIT}`}
        </pre>
        <p className='text-xs'>{t('workdir.sideEffect')}</p>
      </AlertDescription>
    </Alert>
  );
}
