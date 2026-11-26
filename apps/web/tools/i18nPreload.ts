import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { normalizePath, parseSync, type Plugin } from 'vite';

import { isGeneratedNamespace } from './i18n.ts';

/** Native dev ESM evaluates every re-export of a slice, including its UI, for a single dictionary name. */
export function metaboxLocalePreloads(root: string): Plugin {
  const app = normalizePath(path.join(realpathSync(root), 'src', 'app')) + '/';

  return {
    name: 'metabox-locale-preloads',
    apply: 'serve',
    transform: {
      async handler(code, id) {
        if (this.environment.name !== 'client' || !id.startsWith(app) || !code.includes('preloadNamespaces')) return;

        const imports = parseSync(id, code).module.staticImports;
        let result = code;
        for (let index = imports.length - 1; index >= 0; index -= 1) {
          const { moduleRequest, entries } = imports[index];
          if (entries.length !== 1 || !/^@(features|widgets)\//u.test(moduleRequest.value)) continue;
          const binding = entries[0];
          const symbol = binding.importName.name;
          if (binding.isType || binding.importName.kind !== 'Name' || symbol?.endsWith('_NS') !== true) continue;

          const entry = await this.resolve(moduleRequest.value, id);
          if (!entry || path.basename(entry.id) !== 'index.ts') continue;
          const target = namespaceExport(entry.id, symbol);
          if (target === undefined) continue;

          this.addWatchFile(entry.id);
          const specifier = './' + normalizePath(path.relative(path.dirname(id), target));
          result = result.slice(0, moduleRequest.start) + JSON.stringify(specifier) + result.slice(moduleRequest.end);
        }
        if (result !== code) return { code: result, map: null };
      },
    },
  };
}

function namespaceExport(entry: string, symbol: string): string | undefined {
  const body = parseSync(entry, readFileSync(entry, 'utf8')).program.body;
  let target: string | undefined;
  for (const statement of body) {
    if (statement.type !== 'ExportNamedDeclaration' || !statement.source) return undefined;
    if (
      statement.exportKind === 'type' ||
      !/^\.\/i18n\/[^/]+\.namespace\.generated$/u.test(statement.source.value) ||
      !statement.specifiers.some(
        (spec) =>
          spec.exportKind !== 'type' &&
          spec.local.type === 'Identifier' &&
          spec.local.name === symbol &&
          spec.exported.type === 'Identifier' &&
          spec.exported.name === symbol
      )
    )
      continue;

    const file = path.resolve(path.dirname(entry), statement.source.value + '.ts');
    if (existsSync(file) && isGeneratedNamespace(readFileSync(file, 'utf8'))) target = file;
  }
  return target;
}
