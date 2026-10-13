import { ApiError } from '@shared/api';
import { MS_IN_SECOND } from '@shared/lib/time';

import {
  CheckDetailsSchema,
  WorkdirDetailsSchema,
  type ConfigVersionsWire,
  type ConfigVersionWire,
} from '../api/Config.schema';
import type { CheckFailure, ConfigVersion, WorkdirMismatch } from './Config.model';

/**
 * A version matches the device when both the config and the list file set
 * match. A version without `lists_sum` was saved before list snapshots:
 * restoring it does not touch lists, and there is nothing to compare them with.
 */
function isCurrent(wire: ConfigVersionWire, versions: ConfigVersionsWire): boolean {
  return (
    wire.sum === versions.current_sum && (wire.lists_sum === undefined || wire.lists_sum === versions.current_lists_sum)
  );
}

function toConfigVersion(wire: ConfigVersionWire, versions: ConfigVersionsWire): ConfigVersion {
  return {
    id: wire.id,
    size: wire.size,
    sum: wire.sum,
    current: isCurrent(wire, versions),
    savedAt: wire.saved_at > 0 ? wire.saved_at * MS_IN_SECOND : null,
  };
}

/**
 * History from the newest version to the oldest: the daemon serves it by
 * ascending number, while rollbacks usually go to the previous config, not the
 * oldest one.
 */
export function toConfigVersions(wire: ConfigVersionsWire): ConfigVersion[] {
  return [...wire.versions].sort((left, right) => right.id - left.id).map((version) => toConfigVersion(version, wire));
}

/** Daemon failure code whose `details` holds the binary output. */
const CHECK_FAILED = 'check_failed';

/**
 * Extracts the `sing-box check` output from an apply failure. `null` means a
 * different failure: the config may not have reached the binary at all, and
 * there is nothing to show then.
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

/** Daemon failure code whose `details` holds the service working directory and the config directory. */
const WORKDIR_MISMATCH = 'workdir_mismatch';

/**
 * Extracts the directories from an apply failure by the service working
 * directory. `null` means a different failure or the details were not parsed:
 * there is nothing to build a hint from then, and the failure text remains.
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
