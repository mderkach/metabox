import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

import { LOCALE_ROOT, checkLocales, collectLocales, hashedLocaleUrl, localeKey, writeI18nTypes } from './i18n.ts';

const LOCALE_SEGMENT = 'i18n';
const LOCALE_GLOB = `src/**/${LOCALE_SEGMENT}/*.json`;

/** The URL map of dictionaries arrives in the bundle as a module: there is no extra request for it. */
const LOCALE_MODULE = 'virtual:metabox-locales';

export function metaboxI18n(root: string): Plugin {
  let isBuild = false;
  const urls = new Map<string, string>();

  function report(problems: readonly string[]) {
    if (problems.length > 0) {
      console.warn(`[I18N] dictionaries diverged:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    }
  }

  function refreshUrls(): { url: string; source: string }[] {
    urls.clear();

    return collectLocales(path.join(root, 'src')).map((locale) => {
      const source = readFileSync(locale.file, 'utf8');
      const url = isBuild ? hashedLocaleUrl(locale, source) : locale.url;

      urls.set(localeKey(locale.language, locale.namespace), `/${url}`);

      return { url, source };
    });
  }

  return {
    name: 'metabox-i18n',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    resolveId(id) {
      return id === LOCALE_MODULE ? `\0${LOCALE_MODULE}` : undefined;
    },
    load(id) {
      if (id !== `\0${LOCALE_MODULE}`) {
        return undefined;
      }

      return `export const LOCALE_URLS = ${JSON.stringify(Object.fromEntries(urls))};`;
    },
    buildStart() {
      writeI18nTypes(root);

      const problems = checkLocales(root);

      report(problems);

      if (problems.length > 0) {
        this.error('[I18N] language dictionaries do not match by keys');
      }

      for (const { url, source } of refreshUrls()) {
        if (isBuild) this.emitFile({ type: 'asset', fileName: url, source });
      }
    },
    configureServer(server) {
      server.watcher.add(path.join(root, LOCALE_GLOB));

      // The dev server serves dictionaries from the same addresses as the build: otherwise
      // the runtime would have to be taught two ways to look for them.
      server.middlewares.use(`/${LOCALE_ROOT}/`, (request, response, next) => {
        const locale = collectLocales(path.join(root, 'src')).find(
          (candidate) => `/${candidate.url}` === `/${LOCALE_ROOT}${request.url ?? ''}`
        );

        if (locale === undefined) {
          next();

          return;
        }

        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(readFileSync(locale.file, 'utf8'));
      });

      function onLocaleChange(file: string) {
        if (!file.endsWith('.json') || !file.includes(`${path.sep}${LOCALE_SEGMENT}${path.sep}`)) {
          return;
        }

        writeI18nTypes(root);
        report(checkLocales(root));
        refreshUrls();

        const graph = server.environments.client.moduleGraph;
        const module = graph.getModuleById(`\0${LOCALE_MODULE}`);

        if (module !== undefined) graph.invalidateModule(module);

        server.ws.send({ type: 'full-reload' });
      }

      server.watcher.on('add', onLocaleChange).on('change', onLocaleChange).on('unlink', onLocaleChange);
    },
  };
}
