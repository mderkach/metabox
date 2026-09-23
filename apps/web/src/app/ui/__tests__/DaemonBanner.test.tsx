import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { DAEMON_ENDPOINT } from '@entities/Daemon';

import { DaemonBanner } from '../DaemonBanner';

const UNREACHABLE = 'metabox не отвечает. Панель показывает последние загруженные данные, применять изменения нельзя.';
const SCHEMA = 'Панель не разобрала ответ metabox: версия демона новее панели. Данные на экранах могут быть неполными.';

describe('DaemonBanner', () => {
  it('сообщает, что демон не отвечает, когда до него не дойти', async () => {
    server.use(http.get(DAEMON_ENDPOINT.status(), () => new HttpResponse(null, { status: 503 })));

    renderWithQuery(<DaemonBanner />);

    expect(await screen.findByRole('status')).toHaveTextContent(UNREACHABLE);
  });

  it('отличает непонятый ответ от молчания демона', async () => {
    server.use(http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json({ unexpected: true })));

    renderWithQuery(<DaemonBanner />);

    expect(await screen.findByRole('status')).toHaveTextContent(SCHEMA);
  });
});
