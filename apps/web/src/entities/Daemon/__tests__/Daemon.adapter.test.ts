import { describe, expect, it, vi } from 'vitest';

import { DaemonStatusSchema } from '../api/Daemon.schema';
import {
  toClashConfigs,
  toDaemonStatus,
  toServiceFrame,
  toServiceState,
  toTrafficFrame,
} from '../model/Daemon.adapter';
import { APPLY_PHASE, SERVICE_STATUS } from '../model/Daemon.model';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  SERVICE_UNREAD_FIXTURE,
} from './Daemon.fixture';

describe('toDaemonStatus', () => {
  it('converts the daemon response to the model', () => {
    const status = toDaemonStatus(DAEMON_STATUS_FIXTURE);

    expect(status.version).toBe(DAEMON_STATUS_FIXTURE.version);
    expect(status.singboxVersion).toBe(DAEMON_STATUS_FIXTURE.singbox_version);
    expect(status.configPath).toBe(DAEMON_STATUS_FIXTURE.config_path);
  });

  it('reads an unknown apply stage as a failure, not as a confirmation', () => {
    const status = toDaemonStatus({
      ...DAEMON_STATUS_FIXTURE,
      transaction: { id: 'a', phase: 'teleporting', window: 0 },
    });

    expect(status.transaction?.phase).toBe(APPLY_PHASE.Failed);
  });

  it('does not accept a response without the daemon version', () => {
    expect(DaemonStatusSchema.safeParse({ singbox_version: '1.14.0' }).success).toBe(false);
  });
});

describe('toServiceState', () => {
  it('converts the service state to the model', () => {
    const state = toServiceState(SERVICE_RUNNING_FIXTURE);

    expect(state.status).toBe(SERVICE_STATUS.Running);
    expect(state.binary).toBe(SERVICE_RUNNING_FIXTURE.binary);
  });

  it('reads an unknown state as a crash, not as running', () => {
    const state = toServiceState({ ...SERVICE_RUNNING_FIXTURE, status: 'zombie' });

    expect(state.status).toBe(SERVICE_STATUS.Failed);
  });

  it('carries the read failure code together with the daemon text', () => {
    const state = toServiceState(SERVICE_UNREAD_FIXTURE);

    expect(state.lastErrorCode).toBe('service_state_unread');
    expect(state.lastError).toBe(SERVICE_UNREAD_FIXTURE.lastError);
  });

  it('drops an unknown code, keeps the daemon text', () => {
    const state = toServiceState({ ...SERVICE_UNREAD_FIXTURE, lastErrorCode: 'procd_gone' });

    expect(state.lastErrorCode).toBeUndefined();
    expect(state.lastError).toBe(SERVICE_UNREAD_FIXTURE.lastError);
  });
});

describe('toClashConfigs', () => {
  it('converts Clash API keys to the model', () => {
    const configs = toClashConfigs(CLASH_CONFIGS_FIXTURE);

    expect(configs.mode).toBe(CLASH_CONFIGS_FIXTURE.mode);
    expect(configs.modeList).toEqual(CLASH_CONFIGS_FIXTURE['mode-list']);
    expect(configs.logLevel).toBe(CLASH_CONFIGS_FIXTURE['log-level']);
    expect(configs.bindAddress).toBe(CLASH_CONFIGS_FIXTURE['bind-address']);
  });

  it('keeps the mode from the config rules as is, instead of replacing it with the default mode', () => {
    const configs = toClashConfigs({ ...CLASH_CONFIGS_FIXTURE, mode: 'Proxy', 'mode-list': ['Rule', 'Proxy'] });

    expect(configs.mode).toBe('Proxy');
    expect(configs.modeList).toEqual(['Rule', 'Proxy']);
  });
});

describe('stream frames', () => {
  it('rejects an unrecognized frame instead of crashing the subscription', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(toTrafficFrame({ up: 'много' })).toBeNull();
    expect(toServiceFrame({})).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });

  it('converts a valid frame to the model', () => {
    expect(toTrafficFrame({ up: 10, down: 20 })).toEqual({ up: 10, down: 20 });
    expect(toServiceFrame(SERVICE_RUNNING_FIXTURE)?.status).toBe(SERVICE_STATUS.Running);
  });
});
