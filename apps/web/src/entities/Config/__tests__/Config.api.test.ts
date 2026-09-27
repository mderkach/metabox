import { server } from '@test/server';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';

import { applyConfig } from '../api/Config.api';

const TRANSACTION = { id: 'tx-1', phase: 'applying', window: 60 };

interface CapturedApply {
  contentType: string | null;
  ifMatch: string | null;
  body: string;
}

function captureApply(): { current: () => CapturedApply | null } {
  let captured: CapturedApply | null = null;

  server.use(
    http.post(DAEMON_ENDPOINT.apply(), async ({ request }) => {
      captured = {
        contentType: request.headers.get('content-type'),
        ifMatch: request.headers.get('if-match'),
        body: await request.text(),
      };

      return HttpResponse.json(TRANSACTION);
    })
  );

  return { current: () => captured };
}

describe('applyConfig', () => {
  it('без файлов тело — голые байты конфига, как и раньше', async () => {
    const captured = captureApply();

    await applyConfig({ text: '{"log":{}}', base: 'abc' });

    expect(captured.current()?.body).toBe('{"log":{}}');
    expect(captured.current()?.contentType).toContain('application/json');
    expect(captured.current()?.ifMatch).toBe('abc');
  });

  it('с файлами уезжает конверт со своим типом', async () => {
    const captured = captureApply();

    await applyConfig({
      text: '{"log":{}}',
      base: null,
      lists: { put: { 'my.json': '{"version":1}' }, remove: ['gone.json'], base: 'set-etag' },
    });

    expect(captured.current()?.contentType).toContain('application/vnd.metabox.apply+json');
    expect(JSON.parse(captured.current()?.body ?? '{}')).toEqual({
      config: '{"log":{}}',
      lists: { 'my.json': '{"version":1}' },
      remove_lists: ['gone.json'],
      lists_base: 'set-etag',
    });
  });

  it('пустые изменения файлов не переключают тело на конверт', async () => {
    const captured = captureApply();

    await applyConfig({ text: '{}', base: null, lists: { put: {}, remove: [], base: 'set-etag' } });

    expect(captured.current()?.body).toBe('{}');
    expect(captured.current()?.contentType).toContain('application/json');
  });
});
