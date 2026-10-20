import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { MCP_ENDPOINT } from '@entities/Mcp';
import { createMcpHandlers, MCP_TOKEN_FIXTURE } from '@entities/Mcp/__tests__/Mcp.handlers';
import { showQueryError } from '@shared/api';

import { McpAccess } from '../ui';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

/** The real toast path of the application: errors of mutations go through `meta`. */
function renderMcp(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        showQueryError(mutation.meta, error);
      },
    }),
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('McpAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains MCP while it is off and shows the token once after enabling', async () => {
    const user = userEvent.setup();
    server.use(...createMcpHandlers());

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));

    expect(screen.getByText(/Доступ только на чтение/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Включить' }));

    const token = await screen.findByLabelText('Токен');

    expect(token).toHaveValue(MCP_TOKEN_FIXTURE[0]);
    expect(token).toHaveAttribute('readonly');
    await waitFor(() => expect(token).toHaveFocus());
    expect(screen.getByRole('alert')).toHaveTextContent('Токен показывается один раз');
    expect(screen.getByLabelText('Команда для Claude Code')).toHaveValue(
      `claude mcp add --transport http metabox ${window.location.origin}/mcp --header "Authorization: Bearer ${MCP_TOKEN_FIXTURE[0]}"`
    );
  });

  it('clears the token when the dialog closes and never shows it again', async () => {
    const user = userEvent.setup();
    server.use(...createMcpHandlers());

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));
    await user.click(screen.getByRole('button', { name: 'Включить' }));
    await screen.findByLabelText('Токен');
    await user.click(screen.getByRole('button', { name: 'Готово' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Доступ MCP' }));

    expect(await screen.findByText(window.location.origin + '/mcp')).toBeInTheDocument();
    expect(screen.queryByLabelText('Токен')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(MCP_TOKEN_FIXTURE[0])).not.toBeInTheDocument();
  });

  it('shows status, address and permissions while it is on', async () => {
    const user = userEvent.setup();
    server.use(...createMcpHandlers({ enabled: true }));

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));

    expect(await screen.findByText('Включён')).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/mcp`)).toBeInTheDocument();
    expect(screen.getByText('чтение')).toBeInTheDocument();
  });

  it('regenerates the token only after a confirmation', async () => {
    const user = userEvent.setup();
    let issued = 0;

    server.use(
      http.post(MCP_ENDPOINT.token(), () => {
        issued += 1;

        return HttpResponse.json({ token: MCP_TOKEN_FIXTURE[1], endpoint: '/mcp', permissions: ['read'] });
      }),
      ...createMcpHandlers({ enabled: true })
    );

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));
    await user.click(await screen.findByRole('button', { name: 'Перевыпустить токен' }));

    const confirm = await screen.findByRole('alertdialog');

    expect(within(confirm).getByText(/Старый токен перестанет работать/)).toBeInTheDocument();
    expect(issued).toBe(0);

    await user.click(within(confirm).getByRole('button', { name: 'Перевыпустить' }));

    expect(await screen.findByLabelText('Токен')).toHaveValue(MCP_TOKEN_FIXTURE[1]);
    expect(issued).toBe(1);
  });

  it('does not regenerate when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    let issued = 0;

    server.use(
      http.post(MCP_ENDPOINT.token(), () => {
        issued += 1;

        return HttpResponse.json({ token: MCP_TOKEN_FIXTURE[1], endpoint: '/mcp', permissions: ['read'] });
      }),
      ...createMcpHandlers({ enabled: true })
    );

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));
    await user.click(await screen.findByRole('button', { name: 'Перевыпустить токен' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Отмена' }));

    expect(issued).toBe(0);
    expect(screen.queryByLabelText('Токен')).not.toBeInTheDocument();
  });

  it('disables MCP after a confirmation', async () => {
    const user = userEvent.setup();
    server.use(...createMcpHandlers({ enabled: true }));

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));
    await user.click(await screen.findByRole('button', { name: 'Выключить' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Выключить' }));

    expect(await screen.findByRole('button', { name: 'Включить' })).toBeInTheDocument();
    expect(screen.queryByText('Включён')).not.toBeInTheDocument();
  });

  it('copies the token and announces it', async () => {
    const user = userEvent.setup();
    server.use(...createMcpHandlers());

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));
    await user.click(screen.getByRole('button', { name: 'Включить' }));
    await screen.findByLabelText('Токен');
    await user.click(screen.getByRole('button', { name: 'Скопировать: Токен' }));

    expect(await screen.findByRole('status', { name: 'Результат действия' })).toHaveTextContent('Скопировано: Токен');
    expect(await navigator.clipboard.readText()).toBe(MCP_TOKEN_FIXTURE[0]);
  });

  it('copies through a selected field when the page has no clipboard API, as over plain http', async () => {
    const user = userEvent.setup();
    server.use(...createMcpHandlers());
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    let copied: string | null = null;
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn<(command: string) => boolean>((command) => {
        // oxlint-disable-next-line testing-library/no-node-access -- the temporary field is hidden from the accessibility tree
        const field = document.activeElement;

        if (command === 'copy' && field instanceof HTMLTextAreaElement) {
          copied = field.value.slice(field.selectionStart, field.selectionEnd);
        }

        return copied !== null;
      }),
    });
    onTestFinished(() => {
      Reflect.deleteProperty(document, 'execCommand');
    });

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));
    await user.click(screen.getByRole('button', { name: 'Включить' }));
    await screen.findByLabelText('Токен');

    const copy = screen.getByRole('button', { name: 'Скопировать: Токен' });

    await user.click(copy);

    expect(await screen.findByRole('status', { name: 'Результат действия' })).toHaveTextContent('Скопировано: Токен');
    expect(copied).toBe(MCP_TOKEN_FIXTURE[0]);
    expect(screen.getAllByLabelText('Токен')).toHaveLength(1);
    expect(copy).toHaveFocus();
  });

  it('selects the token and says so when the browser refuses the clipboard', async () => {
    const user = userEvent.setup();
    server.use(...createMcpHandlers());
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('not allowed'));

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));
    await user.click(screen.getByRole('button', { name: 'Включить' }));
    await screen.findByLabelText('Токен');
    await user.click(screen.getByRole('button', { name: 'Скопировать: Токен' }));

    expect(await screen.findByRole('status', { name: 'Результат действия' })).toHaveTextContent(
      'Браузер не разрешил копирование'
    );
    expect(screen.getByLabelText('Токен')).toHaveFocus();
  });

  it('shows a toast when the token cannot be issued and stays off', async () => {
    const user = userEvent.setup();

    server.use(
      http.post(MCP_ENDPOINT.token(), () =>
        HttpResponse.json({ code: 'internal', message: 'внутренняя ошибка демона' }, { status: 500 })
      ),
      ...createMcpHandlers()
    );

    renderMcp(<McpAccess />);
    await user.click(await screen.findByRole('button', { name: 'Доступ MCP' }));
    await user.click(screen.getByRole('button', { name: 'Включить' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Выпустить токен MCP не удалось'));
    });
    expect(screen.queryByLabelText('Токен')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Включить' })).toBeEnabled();
  });

  it('is hidden while the daemon does not know the MCP endpoint', async () => {
    let asked = false;

    server.use(
      http.get(MCP_ENDPOINT.state(), () => {
        asked = true;

        return new Response(null, { status: 404 });
      })
    );

    renderMcp(<McpAccess />);

    await waitFor(() => {
      expect(asked).toBe(true);
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
