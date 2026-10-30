import { describe, expect, it } from 'vitest';

import { API_FAILURE, ApiError } from '@shared/api';

import { ConfigVersionsSchema } from '../api/Config.schema';
import { toCheckFailure, toConfigVersions, toWorkdirMismatch } from '../model/Config.adapter';

const VERSIONS_WIRE = {
  versions: [
    { id: 1, size: 2048, sum: 'a1', saved_at: 1_757_000_000 },
    { id: 3, size: 4096, sum: 'c3', saved_at: 0 },
    { id: 2, size: 3072, sum: 'b2', saved_at: 1_757_100_000 },
  ],
};

describe('toConfigVersions', () => {
  it('returns history from the newest version to the oldest', () => {
    expect(toConfigVersions(VERSIONS_WIRE).versions.map((version) => version.id)).toEqual([3, 2, 1]);
  });

  it('converts device seconds to epoch milliseconds', () => {
    const [, , oldest] = toConfigVersions(VERSIONS_WIRE).versions;

    expect(oldest.savedAt).toBe(1_757_000_000_000);
  });

  it('reads a zero mark as no time: the device clock is not synchronized', () => {
    const [newest] = toConfigVersions(VERSIONS_WIRE).versions;

    expect(newest.savedAt).toBeNull();
  });

  it('marks as current the version whose fingerprint matches the file on the device', () => {
    const versions = toConfigVersions({ ...VERSIONS_WIRE, current_sum: 'b2' });

    expect(versions.versions.filter((version) => version.current).map((version) => version.id)).toEqual([2]);
  });

  it('without a file fingerprint marks none as current', () => {
    expect(toConfigVersions(VERSIONS_WIRE).versions.some((version) => version.current)).toBe(false);
  });

  it('does not mark as current a version with the same config but different lists: its rollback would restore the lists', () => {
    const versions = toConfigVersions({
      versions: [
        { id: 1, size: 2048, sum: 'a1', saved_at: 0, lists_sum: 'l1' },
        { id: 2, size: 2048, sum: 'a1', saved_at: 0, lists_sum: 'l2' },
      ],
      current_sum: 'a1',
      current_lists_sum: 'l2',
    });

    expect(versions.versions.filter((version) => version.current).map((version) => version.id)).toEqual([2]);
  });

  it('for a version without a lists snapshot compares only the config: its rollback does not touch the lists', () => {
    const versions = toConfigVersions({ ...VERSIONS_WIRE, current_sum: 'b2', current_lists_sum: 'l1' });

    expect(versions.versions.filter((version) => version.current).map((version) => version.id)).toEqual([2]);
  });

  it('keeps saved versions but marks none current when current lists cannot be read', () => {
    const history = toConfigVersions({
      versions: [
        { id: 1, size: 2048, sum: 'a1', saved_at: 0 },
        { id: 2, size: 2048, sum: 'a1', saved_at: 0, lists_sum: 'l1' },
      ],
      current_sum: 'a1',
      current_lists_sum: 'l1',
      current_lists_unavailable: true,
    });

    expect(history.currentListsUnavailable).toBe(true);
    expect(history.versions.map((version) => version.id)).toEqual([2, 1]);
    expect(history.versions.some((version) => version.current)).toBe(false);
  });

  it.each([undefined, false])('keeps legacy comparison when the unavailable marker is %s', (unavailable) => {
    const history = toConfigVersions({
      ...VERSIONS_WIRE,
      current_sum: 'b2',
      current_lists_unavailable: unavailable,
    });

    expect(history.currentListsUnavailable).toBe(false);
    expect(history.versions.filter((version) => version.current).map((version) => version.id)).toEqual([2]);
  });

  it('does not accept a version without a number: it defines the history order', () => {
    expect(ConfigVersionsSchema.safeParse({ versions: [{ size: 1, sum: 'x', saved_at: 0 }] }).success).toBe(false);
  });
});

describe('toCheckFailure', () => {
  const details = { stdout: 'ok', stderr: 'FATAL rule 3', exit_code: 1 };

  it('extracts the binary output from a check failure', () => {
    const error = new ApiError(API_FAILURE.Response, 'отказ', { code: 'check_failed', details });

    expect(toCheckFailure(error)).toEqual({ stdout: 'ok', stderr: 'FATAL rule 3', exitCode: 1 });
  });

  it('stays silent when the failure is a different one: nothing to show', () => {
    const error = new ApiError(API_FAILURE.Response, 'отказ', { code: 'config_missing' });

    expect(toCheckFailure(error)).toBeNull();
  });

  it('stays silent when the failure carries no binary output', () => {
    const error = new ApiError(API_FAILURE.Response, 'отказ', { code: 'check_failed', details: 'просто строка' });

    expect(toCheckFailure(error)).toBeNull();
  });
});

describe('toWorkdirMismatch', () => {
  const details = { workdir: '/usr/share/sing-box', config_dir: '/etc/sing-box' };

  it('extracts both directories from a failure about the service working directory', () => {
    const error = new ApiError(API_FAILURE.Response, 'отказ', { code: 'workdir_mismatch', details });

    expect(toWorkdirMismatch(error)).toEqual({ workdir: '/usr/share/sing-box', configDir: '/etc/sing-box' });
  });

  it('stays silent when the failure is a different one', () => {
    const error = new ApiError(API_FAILURE.Response, 'отказ', { code: 'check_failed', details });

    expect(toWorkdirMismatch(error)).toBeNull();
  });

  it('stays silent when the failure has no directories: there is nothing to build the command from', () => {
    const error = new ApiError(API_FAILURE.Response, 'отказ', { code: 'workdir_mismatch', details: { workdir: 1 } });

    expect(toWorkdirMismatch(error)).toBeNull();
  });
});
