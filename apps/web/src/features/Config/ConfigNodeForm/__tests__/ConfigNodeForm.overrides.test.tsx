import { renderWithQuery } from '@test/renderWithQuery';
import { selectOption } from '@test/selectOption';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState, findValue, NODE_REGISTRY, RULES_PATH, useConfigText } from '@entities/Config';
import { ConfigNodeAddForm } from '@features/Config/ConfigNodeAdd';
import { ConfigSchema } from '@shared/api/generated';
import { parseJsonc } from '@shared/lib/jsonc';

import { NODE_OVERRIDE_ERROR, nodeOverrideOf, overrideIssues } from '../model';
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
function NodeFromStore({ path, builtTags = null }: { path: JSONPath; builtTags?: readonly string[] | null }) {
  const text = useConfigText();
  const node = useMemo(() => (text === null ? undefined : findValue(text, path)), [text, path]);

  return isRecord(node) ? (
    <ConfigNodeForm registry={NODE_REGISTRY.Outbound} path={path} node={node} builtTags={builtTags} />
  ) : null;
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

    expect(inDocumentOrder([...primary, screen.getByRole('button', { name: 'Дополнительно' })])).toBe(true);
    expect(screen.getByRole('button', { name: 'Дополнительно' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'domain_strategy' })).not.toBeInTheDocument();
  });

  it('свёрнутая группа открывает остальные поля без повторов основных', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    await user.click(screen.getByRole('button', { name: 'Дополнительно' }));

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
    await user.type(key, PUBLIC_KEY);
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

    expect(screen.getByText('нет в сборке: with_utls')).toBeInTheDocument();

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

    await user.type(screen.getByRole('textbox', { name: 'server' }), 'a.example');
    await user.type(screen.getByRole('spinbutton', { name: 'server_port' }), '443');
    await user.type(screen.getByRole('textbox', { name: 'uuid' }), UUID);
    await user.type(screen.getByRole('textbox', { name: 'tls.server_name' }), 'www.example');
    await user.type(screen.getByRole('textbox', { name: 'tls.reality.public_key' }), PUBLIC_KEY);
    await user.type(screen.getByRole('textbox', { name: 'tls.reality.short_id' }), '0123456789abcdef');
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
