import { afterEach, describe, expect, it, vi } from 'vitest';

import { readSeenProviders, writeSeenProviders } from '../model/Proxy.storage';

const KEY = 'metabox.proxy.providers';

describe('seen subscriptions storage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads back what it wrote', () => {
    const seen = { sub: { nodes: 6, updatedAt: '2026-09-10T12:00:00Z', previous: null } };

    writeSeenProviders(seen);

    expect(readSeenProviders()).toEqual(seen);
  });

  it('starts anew from a foreign or broken record', () => {
    localStorage.setItem(KEY, '{"sub":{"nodes":"6"}}');
    expect(readSeenProviders()).toEqual({});

    localStorage.setItem(KEY, 'not json');
    expect(readSeenProviders()).toEqual({});
  });

  it('starts anew when the storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(readSeenProviders()).toEqual({});
  });
});
