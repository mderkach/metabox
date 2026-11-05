import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { metaboxI18n } from './i18nPlugin.ts';

const roots = [];
const servers = [];

function addLocale(root, namespace) {
  const directory = path.join(root, 'src', namespace, 'i18n');

  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'ru.json');

  writeFileSync(file, JSON.stringify({ title: namespace }));

  return file;
}

async function localeMap(server) {
  const result = await server.transformRequest('virtual:metabox-locales');

  return result?.code ?? '';
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));

  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('metaboxI18n', () => {
  it('refreshes the real virtual module when namespaces are added and removed', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'metabox-i18n-'));

    roots.push(root);
    addLocale(root, 'shared');
    const server = await createServer({
      configFile: false,
      root,
      plugins: [metaboxI18n(root)],
      server: { middlewareMode: true, watch: null, ws: false },
    });

    servers.push(server);
    expect(await localeMap(server)).toContain('ru:shared');
    expect(await localeMap(server)).not.toContain('ru:pages/New');

    const added = addLocale(root, 'pages/New');

    server.watcher.emit('add', added);
    expect(await localeMap(server)).toContain('ru:pages/New');

    rmSync(added);
    server.watcher.emit('unlink', added);
    expect(await localeMap(server)).not.toContain('ru:pages/New');
  });
});
