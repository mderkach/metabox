import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Оснастка локалей: карта неймспейсов для i18next и сверка словарей между
 * языками. Ключи в карту не переписываются — их тип берётся из самого JSON
 * через `typeof import`, поэтому карта меняется, только когда локаль появилась
 * или исчезла.
 */

const SOURCE_LANGUAGE = 'ru';
/** Префикс адреса словарей; тот же путь получают файлы в `dist`. */
export const LOCALE_ROOT = 'locales';
const HASH_LENGTH = 8;
const SEGMENT = 'i18n';
const OUT_FILE = 'src/i18n.generated.d.ts';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Суффиксы плюрализации CLDR: в разных языках их наборы разные. */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const HEADER = `/*
 * Карта неймспейсов i18next. Артефакт \`tools/i18n.ts\`, руками не правится.
 * Язык-источник типов — ${SOURCE_LANGUAGE}.
 */`;

export interface Locale {
  namespace: string;
  language: string;
  /** Путь к файлу на диске. */
  file: string;
  /** Адрес на дев-сервере: там словарь читается из исходника и не кэшируется. */
  url: string;
}

/** Ключ словаря в карте адресов: язык и неймспейс вместе. */
export function localeKey(language: string, namespace: string): string {
  return `${language}:${namespace}`;
}

/**
 * Адрес словаря в сборке — с отпечатком содержимого, как у остальных ассетов:
 * демон отдаёт такие файлы вечным кэшем, и словарь перестаёт перепрашиваться
 * на каждом заходе. Длина отпечатка та же, что у Vite, — восемь символов.
 */
export function hashedLocaleUrl(locale: Locale, content: string): string {
  const digest = createHash('sha256').update(content).digest('base64url').slice(0, HASH_LENGTH);

  return `${LOCALE_ROOT}/${locale.namespace}/${locale.language}-${digest}.json`;
}

/** Неймспейс — путь слайса от `src`: `features/Rule/RuleEdit`. */
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
  // Неймспейс без локали языка-источника в карту не попадает: типов у него
  // всё равно нет, а `t` по нему вернул бы ключ.
  return [
    ...new Set(locales.filter((locale) => locale.language === SOURCE_LANGUAGE).map((locale) => locale.namespace)),
  ];
}

/** Кавычки только там, где без них нельзя: иначе `oxfmt` их снимет и разойдётся с артефактом. */
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
 * Возвращает `true`, если файл переписан. Совпадающее содержимое не пишется:
 * иначе каждый запуск обновляет `mtime` и заставляет `tsc -b` пересобирать
 * проект заново.
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

/** Ключ без суффикса формы: сравнивать `_few` с `_other` бессмысленно. */
function baseKeys(value: unknown): Set<string> {
  return new Set(flatten(value).map((key) => key.replace(PLURAL_SUFFIX, '')));
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((key) => !right.has(key)).sort();
}

/**
 * Сверяет словари одного неймспейса между языками и возвращает список проблем;
 * пустой список — всё сошлось. Проверяются разбор файла, наличие локали
 * языка-источника и совпадение ключей с ним.
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
      problems.push(`${relative}: ${error instanceof Error ? error.message : 'не разобран'}`);
    }
  }

  for (const namespace of [...new Set(locales.map((locale) => locale.namespace))].sort()) {
    const source = parsed.get(`${namespace}:${SOURCE_LANGUAGE}`);

    if (source === undefined) {
      problems.push(`${namespace}: нет локали языка-источника ${SOURCE_LANGUAGE}.json`);

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
        problems.push(`${namespace}/${locale.language}.json: нет ключей — ${missing.join(', ')}`);
      }

      if (extra.length > 0) {
        problems.push(`${namespace}/${locale.language}.json: лишние ключи — ${extra.join(', ')}`);
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
    console.error(`[I18N] словари разошлись:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
    process.exit(1);
  }
}
