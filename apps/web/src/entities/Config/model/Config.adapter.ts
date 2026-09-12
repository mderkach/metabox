import { ApiError } from '@shared/api';
import { decodeResponse } from '@shared/api';

import { CheckDetailsSchema, ConfigVersionsSchema, type ConfigVersionWire } from '../api/Config.schema';
import type { CheckFailure, ConfigVersion } from './Config.model';

const MS_IN_SECOND = 1000;

function toConfigVersion(wire: ConfigVersionWire): ConfigVersion {
  return {
    id: wire.id,
    size: wire.size,
    sum: wire.sum,
    savedAt: wire.saved_at > 0 ? wire.saved_at * MS_IN_SECOND : null,
  };
}

/**
 * История от свежей версии к старой: демон отдаёт её по возрастанию номера, а
 * откатываются обычно на предыдущий конфиг, а не на самый старый.
 */
export function toConfigVersions(raw: unknown): ConfigVersion[] {
  const wire = decodeResponse(ConfigVersionsSchema, raw, 'config versions');

  return [...wire.versions].sort((left, right) => right.id - left.id).map(toConfigVersion);
}

/** Код отказа демона, у которого в `details` лежит вывод бинаря. */
const CHECK_FAILED = 'check_failed';

/**
 * Достаёт вывод `sing-box check` из отказа применения. `null` — отказ другой:
 * конфиг мог не дойти до бинаря вовсе, и показывать тогда нечего (AC-26).
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
