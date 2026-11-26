import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { metaboxI18n } from './i18nPlugin.ts';
import { metaboxLocalePreloads } from './i18nPreload.ts';

const roots = [];
const servers = [];

async function setup() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'metabox-preload-')));
  roots.push(root);
  const owner = path.join(root, 'src/features/Example');
  const app = path.join(root, 'src/app');
  mkdirSync(path.join(owner, 'i18n'), { recursive: true });
  mkdirSync(app, { recursive: true });
  writeFileSync(path.join(owner, 'i18n/ru.json'), '{}');
  writeFileSync(path.join(owner, 'ui.ts'), 'export const ui = "screen";');
  const entry = path.join(owner, 'index.ts');
  writeFileSync(entry, "export { EXAMPLE_NS } from './i18n/Example.namespace.generated';\nexport { ui } from './ui';");

  const server = await createServer({
    configFile: false,
    root,
    plugins: [metaboxI18n(root), metaboxLocalePreloads(root)],
    resolve: { alias: { '@features': path.join(root, 'src/features') } },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  servers.push(server);

  async function compile(name, code) {
    writeFileSync(path.join(app, name + '.ts'), code);
    return (await server.transformRequest('/src/app/' + name + '.ts')).code;
  }

  return { server, entry, compile };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('dictionary-only imports on the dev server', () => {
  it('loads the generated owner module directly while preserving mixed imports', async () => {
    const { compile } = await setup();
    const only = await compile(
      'only',
      "import { EXAMPLE_NS as dictionary } from '@features/Example'; export const preloadNamespaces = [dictionary];"
    );
    expect(only).toContain('from "/src/features/Example/i18n/Example.namespace.generated.ts"');
    expect(only).not.toContain('from "/src/features/Example/index.ts"');

    const mixed = await compile(
      'mixed',
      "import { EXAMPLE_NS, ui } from '@features/Example'; export const preloadNamespaces = [EXAMPLE_NS, ui];"
    );
    expect(mixed).toContain('from "/src/features/Example/index.ts"');
  });

  it('keeps the public entry when the target is handwritten or the entry has a side effect', async () => {
    const { entry, compile } = await setup();
    const source = "import { EXAMPLE_NS } from '@features/Example'; export const preloadNamespaces = [EXAMPLE_NS];";
    writeFileSync(
      path.join(path.dirname(entry), 'i18n/Custom.namespace.generated.ts'),
      "export const EXAMPLE_NS = 'custom';"
    );
    writeFileSync(entry, "export { EXAMPLE_NS } from './i18n/Custom.namespace.generated';");
    expect(await compile('custom', source)).toContain('from "/src/features/Example/index.ts"');

    writeFileSync(entry, "import './ui'; export { EXAMPLE_NS } from './i18n/Example.namespace.generated';");
    expect(await compile('sideEffect', source)).toContain('from "/src/features/Example/index.ts"');
  });

  it('rechecks the public re-export when the owner changes it', async () => {
    const { server, entry, compile } = await setup();
    const initial = await compile(
      'entry',
      "import { EXAMPLE_NS } from '@features/Example'; export const preloadNamespaces = [EXAMPLE_NS];"
    );
    expect(initial).toContain('Example.namespace.generated.ts');
    writeFileSync(entry, "export { ui as EXAMPLE_NS } from './ui';");
    server.watcher.emit('change', entry);

    await expect
      .poll(async () => (await server.transformRequest('/src/app/entry.ts')).code)
      .toContain('/src/features/Example/index.ts');
  });
});
