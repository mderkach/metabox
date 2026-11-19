import { server } from '@test/server';
import { describe, expect, it } from 'vitest';

import { applyConfig } from '@entities/Config';

import { DAEMON_ENDPOINT } from '../api/Daemon.endpoints';
import { createStatefulDaemonHandlers } from './Daemon.handlers';

const COMMENTED = '{\n  // TV through VPN\n  "log": {},\n}\n';
const ENVELOPE_TYPE = 'application/vnd.metabox.apply+json';

async function post(body: string, contentType = 'application/json'): Promise<Response> {
  return fetch(new URL(DAEMON_ENDPOINT.apply(), window.location.origin).href, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
}

describe('mock POST /api/apply', () => {
  it('takes the panel request with comments and a trailing comma', async () => {
    server.use(...createStatefulDaemonHandlers());

    await expect(applyConfig({ text: COMMENTED, base: null })).resolves.toMatchObject({ phase: 'awaiting_confirm' });
  });

  it('takes an envelope whose config is a commented object', async () => {
    server.use(...createStatefulDaemonHandlers());

    await expect(
      applyConfig({ text: COMMENTED, base: null, lists: { put: { 'my.json': '{}' }, remove: [], base: null } })
    ).resolves.toMatchObject({ phase: 'awaiting_confirm' });
  });

  it.each([
    ['a config sent through JSON.stringify', JSON.stringify(COMMENTED)],
    ['a bare array', '[]'],
    ['a bare number', '1'],
    ['an empty body', ''],
    ['text that is not JSONC', '{"log":'],
  ])('rejects %s with 400', async (_name, body) => {
    server.use(...createStatefulDaemonHandlers());

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'config_not_object' });
  });

  it.each([
    ['a quoted config', JSON.stringify({ config: JSON.stringify(COMMENTED) })],
    ['an array config', JSON.stringify({ config: '[]' })],
    ['no config field', JSON.stringify({ lists: {} })],
    ['a body that is not an object', '[]'],
  ])('rejects an envelope with %s', async (_name, body) => {
    server.use(...createStatefulDaemonHandlers());

    expect((await post(body, ENVELOPE_TYPE)).status).toBe(400);
  });
});
