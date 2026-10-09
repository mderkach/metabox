import { renderWithQuery } from '@test/renderWithQuery';
import { selectOption } from '@test/selectOption';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConfigDocumentState,
  findValue,
  newSectionNode,
  NODE_REGISTRY,
  RULES_PATH,
  useConfigDiff,
  useConfigText,
  type NodeRegistry,
} from '@entities/Config';
import { ConfigNodeAddForm } from '@features/Config/ConfigNodeAdd';
import { ConfigSchema } from '@shared/api/generated';
import { parseJsonc } from '@shared/lib/jsonc';

import { NODE_OVERRIDE_ERROR, nodeOverrideOf, nodePreset, overrideIssues } from '../model';
import { ConfigNodeForm } from '../ui/ConfigNodeForm';

/** Ключ Reality в формате клиента форка: base64url без паддинга, 32 байта. Не настоящий. */
const PUBLIC_KEY = 'jNXHt1yRo0vDuchQlIP6Z0ZvjT3KtzVI-T4E7RoLJS0';

const UUID = '6f1c1b2e-3d4a-4b5c-8d6e-7f8091a2b3c4';

const TEXT = `{
  // выходы
  "outbounds": [
    {
      "type": "vless",
      "tag": "hk-01",
      "server": "a.example",
      "server_port": 443,
      "uuid": "REDACTED",
      "tls": {
        "enabled": true,
        "server_name": "a.example",
        "utls": { "enabled": true, "fingerprint": "chrome" },
        "reality": { "enabled": true, "public_key": "REDACTED", "short_id": "REDACTED" },
      },
    },
  ],
}`;

const VLESS: JSONPath = ['outbounds', 0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function draft(): string {
  return ConfigDocumentState.getState().draft ?? '';
}

function save() {
  return screen.getByRole('button', { name: 'Сохранить в черновик' });
}

/** Узел читается из стора, как на экране: форма видит каждую правку текста. */
function NodeFromStore({
  path,
  registry = NODE_REGISTRY.Outbound,
  builtTags = null,
}: {
  path: JSONPath;
  registry?: NodeRegistry;
  builtTags?: readonly string[] | null;
}) {
  const text = useConfigText();
  const node = useMemo(() => (text === null ? undefined : findValue(text, path)), [text, path]);

  return isRecord(node) ? <ConfigNodeForm registry={registry} path={path} node={node} builtTags={builtTags} /> : null;
}

/** Идут ли элементы в документе в том порядке, в каком перечислены. */
function inDocumentOrder(elements: readonly HTMLElement[]): boolean {
  return elements.every(
    (element, index) =>
      index === 0 || Boolean(elements[index - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
  );
}

describe('оверрайд формы VLESS/Reality', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('открывается основными полями по порядку, остальное — под свёрнутой группой', () => {
    render(<NodeFromStore path={VLESS} />);

    const primary = [
      screen.getByRole('textbox', { name: 'tag' }),
      screen.getByRole('textbox', { name: 'server' }),
      screen.getByRole('spinbutton', { name: 'server_port' }),
      screen.getByRole('textbox', { name: 'uuid' }),
      screen.getByRole('combobox', { name: 'flow' }),
      screen.getByRole('textbox', { name: 'tls.server_name' }),
      screen.getByRole('combobox', { name: 'tls.utls.fingerprint' }),
      screen.getByRole('textbox', { name: 'tls.reality.public_key' }),
      screen.getByRole('textbox', { name: 'tls.reality.short_id' }),
    ];

    expect(inDocumentOrder([...primary, screen.getByRole('button', { name: /^Ещё параметры/ })])).toBe(true);
    expect(screen.getByRole('button', { name: /^Ещё параметры/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'domain_strategy' })).not.toBeInTheDocument();
  });

  it('свёрнутая группа открывает остальные поля без повторов основных', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    await user.click(screen.getByRole('button', { name: /^Ещё параметры/ }));

    expect(screen.getByRole('combobox', { name: 'domain_strategy' })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: /server_name$/ })).toHaveLength(1);
  });

  it('flow и отпечаток uTLS выбираются из значений форка', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'flow' }), 'xtls-rprx-vision');
    await selectOption(user, screen.getByRole('combobox', { name: 'tls.utls.fingerprint' }), 'firefox');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'flow'])).toBe('xtls-rprx-vision');
    });
    expect(findValue(draft(), [...VLESS, 'tls', 'utls', 'fingerprint'])).toBe('firefox');
  });

  it('пустой server — обязательное поле, запись не идёт', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    await user.clear(screen.getByRole('textbox', { name: 'server' }));
    await user.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('Обязательное поле');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('ключ Reality не в формате клиента форка называется ошибкой, верный — пишется', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    const key = screen.getByRole('textbox', { name: 'tls.reality.public_key' });

    await user.clear(key);
    await user.type(key, 'not-a-key');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ключ Reality: base64url без паддинга, 32 байта (43 символа)'
    );

    await user.click(save());

    expect(ConfigDocumentState.getState().draft).toBeNull();

    await user.clear(key);
    await user.paste(PUBLIC_KEY);
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'tls', 'reality', 'public_key'])).toBe(PUBLIC_KEY);
    });
  });

  it('нетронутые ключи не мешают править соседнее поле', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    await user.type(screen.getByRole('textbox', { name: 'tag' }), '-edited');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'tag'])).toBe('hk-01-edited');
    });
  });

  it('uTLS помечен, когда бинарь собран без with_utls, и не помечен со сборкой', () => {
    const { unmount } = render(<NodeFromStore path={VLESS} builtTags={['with_quic']} />);

    expect(screen.getAllByText('нет в сборке: with_utls')).not.toHaveLength(0);

    unmount();
    render(<NodeFromStore path={VLESS} builtTags={['with_utls']} />);

    expect(screen.queryByText(/нет в сборке/)).not.toBeInTheDocument();
  });
});

describe('проверки оверрайда VLESS', () => {
  const override = nodeOverrideOf(NODE_REGISTRY.Outbound, 'vless');
  const reality = { type: 'vless', server: 'a.example', server_port: 443, uuid: UUID };

  it('ключ и short_id сверяются с форматом клиента форка', () => {
    const node = {
      ...reality,
      tls: { server_name: 'a.example', reality: { enabled: true, public_key: 'abc', short_id: 'xyz' } },
    };

    expect(overrideIssues(override, node, {})).toEqual([
      { name: 'tls.reality.public_key', code: NODE_OVERRIDE_ERROR.RealityPublicKey },
      { name: 'tls.reality.short_id', code: NODE_OVERRIDE_ERROR.RealityShortId },
    ]);
  });

  it('short_id — hex чётной длины до 8 байт, пустой допустим', () => {
    const issues = (shortId: string) =>
      overrideIssues(
        override,
        {
          ...reality,
          tls: { server_name: 'a.example', reality: { enabled: true, public_key: PUBLIC_KEY, short_id: shortId } },
        },
        {}
      );

    expect(issues('0123456789abcdef')).toEqual([]);
    expect(issues('')).toEqual([]);
    expect(issues('abc')).toEqual([{ name: 'tls.reality.short_id', code: NODE_OVERRIDE_ERROR.RealityShortId }]);
    expect(issues('0123456789abcdef00')).toEqual([
      { name: 'tls.reality.short_id', code: NODE_OVERRIDE_ERROR.RealityShortId },
    ]);
  });

  it('имя сервера и ключ обязательны только с Reality', () => {
    expect(overrideIssues(override, { ...reality, tls: { reality: { enabled: true } } }, {})).toEqual([
      { name: 'tls.server_name', code: NODE_OVERRIDE_ERROR.Required },
      { name: 'tls.reality.public_key', code: NODE_OVERRIDE_ERROR.Required },
    ]);
    expect(overrideIssues(override, { ...reality, tls: { enabled: true } }, {})).toEqual([]);
  });
});

/**
 * Сценарий AC-6 на уровне схемы: в пустом документе формами собирается VLESS
 * с Reality и правило на него, и документ принимает схема конфига целиком.
 * `sing-box check` здесь не выполняется — это проверка стенда.
 */
describe('VLESS/Reality с нуля', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load('{}');
  });

  it('узел из формы добавления и формы узла с правилом проходит схему конфига', async () => {
    const user = userEvent.setup();
    const add = renderWithQuery(<ConfigNodeAddForm section='outbounds' takenTags={[]} builtTags={['with_utls']} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Тип' }), 'vless');
    await user.type(screen.getByRole('textbox', { name: 'Тег' }), 'vless-out');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 0, 'tag'])).toBe('vless-out');
    });

    add.unmount();
    render(<NodeFromStore path={VLESS} builtTags={['with_utls']} />);

    // Длинные значения вставляются, а не печатаются: посимвольный ввод с
    // проверкой на каждый символ под нагрузкой упирается в таймаут теста.
    const fill = async (role: 'textbox' | 'spinbutton', name: string, value: string) => {
      await user.click(screen.getByRole(role, { name }));
      await user.paste(value);
    };

    await fill('textbox', 'server', 'a.example');
    await fill('spinbutton', 'server_port', '443');
    await fill('textbox', 'uuid', UUID);
    await fill('textbox', 'tls.server_name', 'www.example');
    await fill('textbox', 'tls.reality.public_key', PUBLIC_KEY);
    await fill('textbox', 'tls.reality.short_id', '0123456789abcdef');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'tls', 'reality', 'short_id'])).toBe('0123456789abcdef');
    });

    ConfigDocumentState.getState().insert([...RULES_PATH, 0], { outbound: 'vless-out' });

    const { value, failure } = parseJsonc(draft());

    expect(failure).toBeNull();
    expect(value).toEqual({
      outbounds: [
        {
          type: 'vless',
          tag: 'vless-out',
          tls: {
            enabled: true,
            utls: { enabled: true, fingerprint: 'chrome' },
            reality: { enabled: true, public_key: PUBLIC_KEY, short_id: '0123456789abcdef' },
            server_name: 'www.example',
          },
          server: 'a.example',
          server_port: 443,
          uuid: UUID,
        },
      ],
      route: { rules: [{ outbound: 'vless-out' }] },
    });
    expect(ConfigSchema.safeParse(value).success).toBe(true);
  });
});

describe('оверрайд службы api', () => {
  const API: JSONPath = ['services', 0];

  it('новая служба слушает loopback и получает случайный секрет, порт не подставлен', () => {
    const first = nodePreset(NODE_REGISTRY.Service, 'api', 'api', newSectionNode);
    const second = nodePreset(NODE_REGISTRY.Service, 'api', 'api', newSectionNode);

    expect({ ...first, secret: null }).toEqual({ type: 'api', tag: 'api', listen: '127.0.0.1', secret: null });
    const secret: unknown = Reflect.get(first, 'secret');

    expect(secret).toMatch(/^[\w-]{32}$/);
    expect(first).not.toEqual(second);
  });

  it('без порта не сохраняется, с портом — пишется в узел', async () => {
    const user = userEvent.setup();

    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(
      JSON.stringify({ services: [nodePreset(NODE_REGISTRY.Service, 'api', 'api', newSectionNode)] }, null, 2)
    );
    render(<NodeFromStore path={API} registry={NODE_REGISTRY.Service} />);

    expect(screen.getByRole('textbox', { name: 'listen' })).toHaveValue('127.0.0.1');
    expect(screen.getByRole('button', { name: 'Поля tls' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'tag' }), '-grpc');
    await user.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('Обязательное поле');
    expect(ConfigDocumentState.getState().draft).toBeNull();

    await user.type(screen.getByRole('spinbutton', { name: 'listen_port' }), '9091');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...API, 'listen_port'])).toBe(9091);
    });
  });
});

describe('поля-секреты', () => {
  /** Подписка и пароль — выдуманные. */
  const SECRET_TEXT = `{
  "outbounds": [
    { "type": "shadowsocks", "tag": "ss", "server": "a.example", "server_port": 8388, "password": "hunter2" },
  ],
  "providers": [
    { "type": "remote", "tag": "sub", "url": "https://sub.example/api/v1/client/subscribe?token=abc123" },
    { "type": "remote", "tag": "bare", "url": "https://bare.example" },
  ],
}`;

  const SHADOWSOCKS: JSONPath = ['outbounds', 0];

  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(SECRET_TEXT);
  });

  it('пароль скрыт маской и раскрывается кнопкой, черновик не трогается', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={SHADOWSOCKS} />);

    const password = screen.getByLabelText('password');

    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveValue('hunter2');

    await user.click(screen.getByRole('button', { name: 'Показать password' }));

    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Скрыть password' }));

    expect(password).toHaveAttribute('type', 'password');
    expect(save()).toBeDisabled();
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('пароль, набранный под маской, ложится в черновик и диф целиком', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={SHADOWSOCKS} />);

    const password = screen.getByLabelText('password');

    await user.clear(password);
    await user.type(password, 'correct-horse');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...SHADOWSOCKS, 'password'])).toBe('correct-horse');
    });

    const { result } = renderHook(() => useConfigDiff());

    expect(result.current.map((line) => line.text).join('\n')).toContain('"password": "correct-horse"');
  });

  it('у URL подписки виден хост, остальное раскрывается кнопкой и правится', async () => {
    const user = userEvent.setup();
    const full = 'https://sub.example/api/v1/client/subscribe?token=abc123';

    render(<NodeFromStore path={['providers', 0]} registry={NODE_REGISTRY.Provider} />);

    const url = screen.getByRole('textbox', { name: 'url' });

    expect(url).toHaveValue('https://sub.example/••••••');
    expect(url).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: 'Показать url' }));

    expect(url).toHaveValue(full);
    expect(url).not.toHaveAttribute('readonly');

    await user.type(url, '2');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), ['providers', 0, 'url'])).toBe(`${full}2`);
    });

    const { result } = renderHook(() => useConfigDiff());

    expect(result.current.map((line) => line.text).join('\n')).toContain(`${full}2`);
  });

  it('URL из одного хоста прятать нечего: поле правится сразу', () => {
    render(<NodeFromStore path={['providers', 1]} registry={NODE_REGISTRY.Provider} />);

    const url = screen.getByRole('textbox', { name: 'url' });

    expect(url).toHaveValue('https://bare.example');
    expect(url).not.toHaveAttribute('readonly');
  });

  it('uuid не прячется: это идентификатор, а не пароль', () => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
    render(<NodeFromStore path={VLESS} />);

    expect(screen.getByRole('textbox', { name: 'uuid' })).toHaveValue('REDACTED');
  });
});
