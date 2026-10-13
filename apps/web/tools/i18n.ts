import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Locale tooling: the namespace map for i18next and cross-language
 * dictionary checking. Keys are not copied into the map — their type is taken from the JSON itself
 * via `typeof import`, so the map changes only when a locale appeared
 * or disappeared.
 */

const SOURCE_LANGUAGE = 'ru';
/** Dictionary URL prefix; files in `dist` get the same path. */
export const LOCALE_ROOT = 'locales';
const HASH_LENGTH = 8;
const SEGMENT = 'i18n';
const OUT_FILE = 'src/i18n.generated.d.ts';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** CLDR plural suffixes: the sets differ between languages. */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const HEADER = `/*
 * Namespace map for i18next. Artifact of \`tools/i18n.ts\`, not edited by hand.
 * Type source language — ${SOURCE_LANGUAGE}.
 */`;

export interface Locale {
  namespace: string;
  language: string;
  /** Path to the file on disk. */
  file: string;
  /** Dev server URL: there the dictionary is read from source and not cached. */
  url: string;
}

/** Dictionary key in the URL map: language and namespace together. */
export function localeKey(language: string, namespace: string): string {
  return `${language}:${namespace}`;
}

/**
 * Dictionary URL in the build — with a content fingerprint, like other assets:
 * the daemon serves such files with an eternal cache, and the dictionary stops being re-requested
 * on every visit. The fingerprint length is the same as Vite's — eight characters.
 */
export function hashedLocaleUrl(locale: Locale, content: string): string {
  const digest = createHash('sha256').update(content).digest('base64url').slice(0, HASH_LENGTH);

  return `${LOCALE_ROOT}/${locale.namespace}/${locale.language}-${digest}.json`;
}

/** Namespace is the slice path from `src`: `features/Rule/RuleEdit`. */
export function collectLocales(root: string, prefix = ''): Locale[] {
  const found: Locale[] = [];

  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

    if (entry.name !== SEGMENT) {
      found.push(...collectLocales(root, relative));

      continue;
    }

    for (const file of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith('.json')) {
        const language = file.name.slice(0, -'.json'.length);

        found.push({
          namespace: prefix,
          language,
          file: path.join(root, relative, file.name),
          url: `${LOCALE_ROOT}/${prefix}/${language}.json`,
        });
      }
    }
  }

  return found;
}

function namespacesOf(locales: readonly Locale[]): string[] {
  // A namespace without a source-language locale does not make it into the map: it has no types
  // anyway, and `t` over it would return the key.
  return [
    ...new Set(locales.filter((locale) => locale.language === SOURCE_LANGUAGE).map((locale) => locale.namespace)),
  ];
}

/** Quotes only where they cannot be avoided: otherwise `oxfmt` strips them and diverges from the artifact. */
function quoteKey(namespace: string): string {
  return IDENTIFIER.test(namespace) ? namespace : `'${namespace}'`;
}

function renderI18nTypes(namespaces: readonly string[]): string {
  const entries = [...namespaces]
    .sort()
    .map((ns) => `      ${quoteKey(ns)}: typeof import('./${ns}/${SEGMENT}/${SOURCE_LANGUAGE}.json');`)
    .join('\n');

  return `${HEADER}

import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
${entries}
    };
  }
}
`;
}

/**
 * Returns `true` if the file was rewritten. Matching content is not written:
 * otherwise every run updates `mtime` and makes `tsc -b` rebuild
 * the project from scratch.
 */
export function writeI18nTypes(projectRoot: string): boolean {
  const target = path.join(projectRoot, OUT_FILE);
  const next = renderI18nTypes(namespacesOf(collectLocales(path.join(projectRoot, 'src'))));
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';

  if (current === next) {
    return false;
  }

  writeFileSync(target, next, 'utf8');

  return true;
}

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, nested]) => flatten(nested, prefix === '' ? key : `${prefix}.${key}`));
}

/** Key without a form suffix: comparing `_few` with `_other` is meaningless. */
function baseKeys(value: unknown): Set<string> {
  return new Set(flatten(value).map((key) => key.replace(PLURAL_SUFFIX, '')));
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((key) => !right.has(key)).sort();
}

/**
 * Checks dictionaries of one namespace across languages and returns a list of problems;
 * an empty list means everything matches. Checked: file parsing, presence of the
 * source-language locale and key match with it.
 */
export function checkLocales(projectRoot: string): string[] {
  const locales = collectLocales(path.join(projectRoot, 'src'));
  const problems: string[] = [];
  const parsed = new Map<string, Set<string>>();

  for (const locale of locales) {
    const relative = path.relative(projectRoot, locale.file);

    try {
      parsed.set(`${locale.namespace}:${locale.language}`, baseKeys(JSON.parse(readFileSync(locale.file, 'utf8'))));
    } catch (error) {
      problems.push(`${relative}: ${error instanceof Error ? error.message : 'not parsed'}`);
    }
  }

  for (const namespace of [...new Set(locales.map((locale) => locale.namespace))].sort()) {
    const source = parsed.get(`${namespace}:${SOURCE_LANGUAGE}`);

    if (source === undefined) {
      problems.push(`${namespace}: no source-language locale ${SOURCE_LANGUAGE}.json`);

      continue;
    }

    for (const locale of locales) {
      const keys = locale.namespace === namespace ? parsed.get(`${namespace}:${locale.language}`) : undefined;

      if (keys === undefined || locale.language === SOURCE_LANGUAGE) {
        continue;
      }

      const missing = difference(source, keys);
      const extra = difference(keys, source);

      if (missing.length > 0) {
        problems.push(`${namespace}/${locale.language}.json: missing keys — ${missing.join(', ')}`);
      }

      if (extra.length > 0) {
        problems.push(`${namespace}/${locale.language}.json: extra keys — ${extra.join(', ')}`);
      }
    }
  }

  return problems;
}

if (process.argv[1] === import.meta.filename) {
  const root = path.resolve(import.meta.dirname, '..');
  const problems = checkLocales(root);

  writeI18nTypes(root);

  if (problems.length > 0) {
    console.error(`[I18N] dictionaries diverged:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    process.exit(1);
  }
}
