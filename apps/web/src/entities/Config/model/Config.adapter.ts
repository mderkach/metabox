import { ApiError } from '@shared/api';
import { MS_IN_SECOND } from '@shared/lib/time';

import {
  CheckDetailsSchema,
  WorkdirDetailsSchema,
  type ConfigVersionsWire,
  type ConfigVersionWire,
} from '../api/Config.schema';
import type { CheckFailure, ConfigVersion, WorkdirMismatch } from './Config.model';

function toConfigVersion(wire: ConfigVersionWire, currentSum: string | undefined): ConfigVersion {
  return {
    id: wire.id,
    size: wire.size,
    sum: wire.sum,
    current: wire.sum === currentSum,
    savedAt: wire.saved_at > 0 ? wire.saved_at * MS_IN_SECOND : null,
  };
}

/**
 * История от свежей версии к старой: демон отдаёт её по возрастанию номера, а
 * откатываются обычно на предыдущий конфиг, а не на самый старый.
 */
export function toConfigVersions(wire: ConfigVersionsWire): ConfigVersion[] {
  return [...wire.versions]
    .sort((left, right) => right.id - left.id)
    .map((version) => toConfigVersion(version, wire.current_sum));
}

/** Код отказа демона, у которого в `details` лежит вывод бинаря. */
const CHECK_FAILED = 'check_failed';

/**
 * Достаёт вывод `sing-box check` из отказа применения. `null` — отказ другой:
 * конфиг мог не дойти до бинаря вовсе, и показывать тогда нечего.
 */
export function toCheckFailure(error: unknown): CheckFailure | null {
  if (!(error instanceof ApiError) || error.code !== CHECK_FAILED) {
    return null;
  }

  const details = CheckDetailsSchema.safeParse(error.details);

  if (!details.success) {
    return null;
  }

  return { stdout: details.data.stdout, stderr: details.data.stderr, exitCode: details.data.exit_code };
}

/** Код отказа демона, у которого в `details` лежат рабочий каталог службы и каталог конфига. */
const WORKDIR_MISMATCH = 'workdir_mismatch';

/**
 * Достаёт каталоги из отказа применения по рабочему каталогу службы. `null` —
 * отказ другой либо подробности не разобрались: подсказку тогда собрать не из
 * чего, и остаётся текст отказа.
 */
export function toWorkdirMismatch(error: unknown): WorkdirMismatch | null {
  if (!(error instanceof ApiError) || error.code !== WORKDIR_MISMATCH) {
    return null;
  }

  const details = WorkdirDetailsSchema.safeParse(error.details);

  if (!details.success) {
    return null;
  }

  return { workdir: details.data.workdir, configDir: details.data.config_dir };
}
