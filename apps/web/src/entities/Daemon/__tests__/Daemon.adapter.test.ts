import { describe, expect, it, vi } from 'vitest';

import { API_FAILURE, ApiError } from '@shared/api';

import {
  toClashConfigs,
  toDaemonStatus,
  toServiceFrame,
  toServiceState,
  toTrafficFrame,
} from '../model/Daemon.adapter';
import { APPLY_PHASE, CLASH_MODE, SERVICE_STATUS } from '../model/Daemon.model';
import { CLASH_CONFIGS_FIXTURE, DAEMON_STATUS_FIXTURE, SERVICE_RUNNING_FIXTURE } from './Daemon.fixture';

function catchApiError(run: () => unknown): ApiError | null {
  try {
    run();
  } catch (error) {
    return error instanceof ApiError ? error : null;
  }

  return null;
}

describe('toDaemonStatus', () => {
  it('переводит ответ демона в модель', () => {
    const status = toDaemonStatus(DAEMON_STATUS_FIXTURE);

    expect(status.version).toBe(DAEMON_STATUS_FIXTURE.version);
    expect(status.singboxVersion).toBe(DAEMON_STATUS_FIXTURE.singbox_version);
    expect(status.configPath).toBe(DAEMON_STATUS_FIXTURE.config_path);
  });

  it('читает незнакомую стадию применения как отказ, а не как подтверждение', () => {
    const status = toDaemonStatus({
      version: '0.1.0',
      transaction: { id: 'a', phase: 'teleporting', window: 0 },
    });

    expect(status.transaction?.phase).toBe(APPLY_PHASE.Failed);
  });

  it('отказывает с видом `schema`, когда версии в ответе нет', () => {
    const failure = catchApiError(() => toDaemonStatus({ singbox_version: '1.14.0' }));

    expect(failure?.kind).toBe(API_FAILURE.Schema);
  });
});

describe('toServiceState', () => {
  it('переводит состояние службы в модель', () => {
    const state = toServiceState(SERVICE_RUNNING_FIXTURE);

    expect(state.status).toBe(SERVICE_STATUS.Running);
    expect(state.binary).toBe(SERVICE_RUNNING_FIXTURE.binary);
  });

  it('читает незнакомое состояние как падение, а не как работу', () => {
    const state = toServiceState({ ...SERVICE_RUNNING_FIXTURE, status: 'zombie' });

    expect(state.status).toBe(SERVICE_STATUS.Failed);
  });
});

describe('toClashConfigs', () => {
  it('переводит ключи Clash API в модель', () => {
    const configs = toClashConfigs(CLASH_CONFIGS_FIXTURE);

    expect(configs.mode).toBe(CLASH_MODE.Rule);
    expect(configs.modeList).toEqual(CLASH_CONFIGS_FIXTURE['mode-list']);
    expect(configs.logLevel).toBe(CLASH_CONFIGS_FIXTURE['log-level']);
    expect(configs.bindAddress).toBe(CLASH_CONFIGS_FIXTURE['bind-address']);
  });
});

describe('кадры потока', () => {
  it('отбраковывает непонятый кадр, а не роняет подписку', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(toTrafficFrame({ up: 'много' })).toBeNull();
    expect(toServiceFrame({})).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });

  it('переводит исправный кадр в модель', () => {
    expect(toTrafficFrame({ up: 10, down: 20 })).toEqual({ up: 10, down: 20 });
    expect(toServiceFrame(SERVICE_RUNNING_FIXTURE)?.status).toBe(SERVICE_STATUS.Running);
  });
});
