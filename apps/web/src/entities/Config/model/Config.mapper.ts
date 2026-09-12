import { ApiError } from '@shared/api';

import type { CheckDetailsDto, ConfigVersionDto } from '../api/Config.dto';
import type { CheckFailure, ConfigVersion } from './Config.model';

const MS_IN_SECOND = 1000;

function toConfigVersion(dto: ConfigVersionDto): ConfigVersion {
  return {
    id: dto.id,
    size: dto.size,
    sum: dto.sum,
    savedAt: dto.saved_at > 0 ? new Date(dto.saved_at * MS_IN_SECOND) : null,
  };
}

/**
 * История от свежей версии к старой: демон отдаёт её по возрастанию номера, а
 * откатываются обычно на предыдущий конфиг, а не на самый старый.
 */
export function toConfigVersions(versions: ConfigVersionDto[]): ConfigVersion[] {
  return [...versions].sort((left, right) => right.id - left.id).map(toConfigVersion);
}

/** Код отказа демона, у которого в `details` лежит вывод бинаря. */
const CHECK_FAILED = 'check_failed';

function isCheckDetails(details: unknown): details is CheckDetailsDto {
  return (
    typeof details === 'object' &&
    details !== null &&
    'stdout' in details &&
    typeof details.stdout === 'string' &&
    'stderr' in details &&
    typeof details.stderr === 'string' &&
    'exit_code' in details &&
    typeof details.exit_code === 'number'
  );
}

/**
 * Достаёт вывод `sing-box check` из отказа применения. `null` — отказ другой:
 * конфиг мог не дойти до бинаря вовсе, и показывать тогда нечего (AC-26).
 */
export function toCheckFailure(error: unknown): CheckFailure | null {
  if (!(error instanceof ApiError) || error.code !== CHECK_FAILED || !isCheckDetails(error.details)) {
    return null;
  }

  return { stdout: error.details.stdout, stderr: error.details.stderr, exitCode: error.details.exit_code };
}
