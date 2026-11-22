import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from 'sonner';
import { afterEach, expect, it, vi } from 'vitest';

import { ConfigDocumentStore, selectConfigCurrent } from '@entities/Config';
import { configHandlers } from '@entities/Config/__tests__/Config.handlers';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { PROXY_ENDPOINT } from '@entities/Proxy';
import { CLASH_PROXIES_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';
import { createStatefulProxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import {
  OutboundMetadataEditSchema,
  type OutboundMetadataEditWire,
  type OutboundsWire,
} from '@shared/api/daemon.generated';

import { ProxiesPage } from '../ui/ProxiesPage';

const SERVER = 'sub-eu/eu-reality';
const MISSING = 'old-lab';
const TARGET = 'sub-nl/nl-xhttp';
const UNUSED_FIXTURE: OutboundsWire = { [MISSING]: { label: 'Лаборатория', norm_ms: 180, unused: true } };

function serveMetadata(initial: OutboundsWire = {}, failTag?: string) {
  const writes: { tag: string; entry: OutboundMetadataEditWire }[] = [];
  const entries = new Map(Object.entries(initial));

  server.use(...configHandlers, ...createStatefulProxyHandlers(undefined, undefined, initial));
  server.use(
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
    http.get(PROXY_ENDPOINT.outbounds(), () => HttpResponse.json(Object.fromEntries(entries))),
    http.put(`${PROXY_ENDPOINT.outbounds()}/:tag`, async ({ request }) => {
      const tag = decodeURIComponent(new URL(request.url).pathname.split('/').at(-1) ?? '');
      const entry = OutboundMetadataEditSchema.parse(await request.json());
      writes.push({ tag, entry });
      if (tag === failTag) return HttpResponse.json({ code: 'internal' }, { status: 500 });

      if (entry.label === undefined && entry.norm_ms === undefined) {
        entries.delete(tag);
      } else {
        entries.set(tag, { ...entry, ...(!Object.hasOwn(CLASH_PROXIES_FIXTURE.proxies, tag) ? { unused: true } : {}) });
      }

      return HttpResponse.json(Object.fromEntries(entries));
    })
  );

  return writes;
}

afterEach(() => {
  ConfigDocumentStore.getState().reset();
  vi.restoreAllMocks();
});

it('edits one group label in place and returns focus to the pencil on Escape', async () => {
  const writes = serveMetadata();
  const user = userEvent.setup();
  renderWithQuery(<ProxiesPage />);

  const pencil = await screen.findByRole('button', { name: 'Имя: proxy' });
  await user.click(pencil);
  const field = screen.getByRole('textbox', { name: 'Своё имя' });
  expect(field).toHaveFocus();
  expect(screen.queryByRole('textbox', { name: 'Обычная задержка, мс' })).not.toBeInTheDocument();

  await user.type(field, 'Временное имя');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('textbox', { name: 'Своё имя' })).not.toBeInTheDocument();
  expect(pencil).toHaveFocus();
  expect(writes).toEqual([]);
});

it('edits both server fields while keeping the current delay visible', async () => {
  serveMetadata();
  const user = userEvent.setup();
  renderWithQuery(<ProxiesPage />);

  const pencil = await screen.findByRole('button', { name: `Имя и обычная задержка: ${SERVER}` });
  const group = within(await screen.findByRole('group', { name: 'proxy' }));
  await user.click(pencil);

  expect(group.getByRole('textbox', { name: 'Своё имя' })).toBeInTheDocument();
  const norm = group.getByRole('textbox', { name: 'Обычная задержка, мс' });
  await waitFor(() => expect(norm).toHaveAccessibleDescription(/По истории: 143 мс/));
  expect(group.getByText('143 мс')).toBeVisible();

  await user.type(norm, '1.5');
  expect(group.getByRole('alert')).toHaveTextContent('Введите целое число');
  await user.click(group.getByRole('button', { name: 'Сохранить' }));
  expect(norm).toBeInTheDocument();
});

it('saves a label through the daemon without changing the config draft or the core', async () => {
  const writes = serveMetadata();
  const service = vi.fn<() => void>();
  const apply = vi.fn<() => void>();
  server.use(
    http.post('/api/apply', () => {
      apply();

      return new HttpResponse(null, { status: 500 });
    }),
    http.post('/api/service/:action', () => {
      service();

      return new HttpResponse(null, { status: 500 });
    })
  );
  const user = userEvent.setup();
  renderWithQuery(<ProxiesPage />);

  await user.click(await screen.findByRole('button', { name: 'Имя: proxy' }));
  await user.type(screen.getByRole('textbox', { name: 'Своё имя' }), 'Европа');
  const currentBefore = selectConfigCurrent(ConfigDocumentStore.getState());
  await user.click(screen.getByRole('button', { name: 'Сохранить' }));

  const heading = await screen.findByRole('heading', { name: /Европа\s*proxy/ });
  expect(within(heading).getByText('proxy')).toHaveClass('font-mono');
  expect(writes).toEqual([{ tag: 'proxy', entry: { label: 'Европа' } }]);
  expect(selectConfigCurrent(ConfigDocumentStore.getState())).toBe(currentBefore);
  expect(service).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(await screen.findByText('Теперь proxy называется «Европа». Применять ничего не нужно.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Имя: proxy' })).toHaveFocus();
});

it('clears an encoded server tag entry and shows the computed norm again', async () => {
  const writes = serveMetadata({ [SERVER]: { label: 'Основной сервер', norm_ms: 500 } });
  const user = userEvent.setup();
  renderWithQuery(<ProxiesPage />);

  await user.click(await screen.findByRole('button', { name: `Имя и обычная задержка: ${SERVER}` }));
  const group = within(screen.getByRole('group', { name: 'proxy' }));
  expect(group.getByText('Обычно: 500 мс (задано вручную)')).toBeVisible();
  await user.clear(group.getByRole('textbox', { name: 'Своё имя' }));
  await user.clear(group.getByRole('textbox', { name: 'Обычная задержка, мс' }));
  await user.click(group.getByRole('button', { name: 'Сохранить' }));

  expect(await group.findByText('Обычно: 143 мс (расчёт)')).toBeVisible();
  expect(group.queryByText('Основной сервер')).not.toBeInTheDocument();
  expect(writes).toEqual([{ tag: SERVER, entry: {} }]);
});

it('does not label an old manual norm as computed while refreshed history is pending', async () => {
  serveMetadata({ [SERVER]: { norm_ms: 500 } });
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const refreshStarted = vi.fn<() => void>();
  let rounds = 0;
  server.use(
    http.get(PROXY_ENDPOINT.latency(), async () => {
      rounds++;
      if (rounds > 1) {
        refreshStarted();
        await ready;
      }

      return HttpResponse.json({
        servers: [
          {
            tag: SERVER,
            usual_ms: 500,
            recent: [],
            hourly: [],
            level: 'no_measurement',
            origin: 'computed',
          },
        ],
      });
    })
  );

  const user = userEvent.setup();
  renderWithQuery(<ProxiesPage />);

  try {
    await user.click(await screen.findByRole('button', { name: `Имя и обычная задержка: ${SERVER}` }));
    const group = within(screen.getByRole('group', { name: 'proxy' }));
    expect(group.getByText('Обычно: 500 мс (задано вручную)')).toBeVisible();
    await user.clear(group.getByRole('textbox', { name: 'Обычная задержка, мс' }));
    await user.click(group.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(refreshStarted).toHaveBeenCalled();
    });
    expect(group.queryByText(/Обычно: 500 мс/)).not.toBeInTheDocument();
  } finally {
    release();
  }
});

it('lists unused tags apart and preserves object key names', async () => {
  serveMetadata({
    ...UNUSED_FIXTURE,
    ['__proto__']: { label: 'Особый тег', unused: true },
    constructor: { label: 'Другой тег', unused: true },
  });
  renderWithQuery(<ProxiesPage />);

  expect(await screen.findByRole('heading', { name: 'Имена без выхода' })).toBeVisible();
  expect(screen.getByText('Лаборатория')).toBeVisible();
  expect(screen.getByText('__proto__')).toBeVisible();
  expect(screen.getByText('constructor')).toBeVisible();
});

it('moves unused metadata to a subscription server before clearing its old tag', async () => {
  const writes = serveMetadata(UNUSED_FIXTURE);
  const user = userEvent.setup();
  renderWithQuery(<ProxiesPage />);

  await user.selectOptions(await screen.findByRole('combobox', { name: `Куда перенести ${MISSING}` }), TARGET);
  await user.click(screen.getByRole('button', { name: `Перенести настройки для ${MISSING}` }));

  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Имена без выхода' })).not.toBeInTheDocument());
  expect(writes).toEqual([
    { tag: TARGET, entry: { label: 'Лаборатория', norm_ms: 180 } },
    { tag: MISSING, entry: {} },
  ]);
});

it('asks before overwrite and keeps the source if removing it fails', async () => {
  const writes = serveMetadata({ ...UNUSED_FIXTURE, [TARGET]: { label: 'Текущее' } }, MISSING);
  const user = userEvent.setup();
  renderWithQuery(<ProxiesPage />);

  await user.selectOptions(await screen.findByRole('combobox', { name: `Куда перенести ${MISSING}` }), TARGET);
  await user.click(screen.getByRole('button', { name: `Перенести настройки для ${MISSING}` }));
  const dialog = within(await screen.findByRole('alertdialog', { name: `Заменить настройки для ${TARGET}?` }));
  expect(writes).toEqual([]);
  await user.click(dialog.getByRole('button', { name: 'Заменить и перенести' }));

  expect(await screen.findByText('Настройки скопированы. Удалить исходную запись не удалось.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Имена без выхода' })).toBeVisible();
  expect(writes.map(({ tag }) => tag)).toEqual([TARGET, MISSING]);
});

it('deletes unused metadata and can restore it from the toast', async () => {
  const writes = serveMetadata(UNUSED_FIXTURE);
  const user = userEvent.setup();
  renderWithQuery(
    <>
      <ProxiesPage />
      <Toaster />
    </>
  );

  await user.click(await screen.findByRole('button', { name: `Удалить настройки для ${MISSING}` }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Имена без выхода' })).not.toBeInTheDocument());
  const undo = await screen.findByRole('button', { name: 'Отменить' });
  undo.focus();
  await user.keyboard('{Enter}');

  expect(await screen.findByRole('heading', { name: 'Имена без выхода' })).toBeVisible();
  expect(writes).toEqual([
    { tag: MISSING, entry: {} },
    { tag: MISSING, entry: { label: 'Лаборатория', norm_ms: 180 } },
  ]);
});

it('shows tags without editing buttons when metadata endpoints are unavailable', async () => {
  serveMetadata();
  server.use(http.get(PROXY_ENDPOINT.outbounds(), () => new HttpResponse(null, { status: 404 })));
  renderWithQuery(<ProxiesPage />);

  expect(await screen.findByRole('heading', { name: 'proxy' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Имя:/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Имена без выхода' })).not.toBeInTheDocument();
});
