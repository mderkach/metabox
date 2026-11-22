import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO = path.resolve(import.meta.dirname, '../../..');
const GLOSSARY = 'apps/web/docs/guides/Glossary.md';
const DICTIONARIES = 'apps/web/src/**/i18n/{en,ru}.json';
const DAEMON_CATALOGUE = 'apps/metaboxd/internal/locale/ru.go';

const FORBIDDEN_SECTION = /^## Forbidden in texts\n([\s\S]*?)(?=^## |(?![\s\S]))/m;
const FORBIDDEN_ITEM = /^- (en|ru|all): `([^`]+)`$/gm;
/** A Go string literal, or literals joined with `+` across lines. */
const LITERAL_CHAIN = String.raw`"(?:[^"\\]|\\.)*"(?:\s*\+\s*"(?:[^"\\]|\\.)*")*`;
/** A `"English source": "Russian text",` entry of the daemon catalogue map. */
const CATALOGUE_ENTRY = new RegExp(String.raw`^\t(${LITERAL_CHAIN}):\s*(${LITERAL_CHAIN}),$`, 'gm');
const LITERAL = /"((?:[^"\\]|\\.)*)"/g;
const CATALOGUE_KEY_LINE = /^\t"/gm;
const PLACEHOLDER = /\{\{[^}]*\}\}/g;
/** Guards the regexps: far fewer entries means the source is no longer read. */
const MIN_FORBIDDEN = 5;
const MIN_DAEMON_TEXTS = 100;

/**
 * Forbidden words a text may keep, as `file key: word`, with the reason. A daemon text is keyed
 * by its English source; a key ending in `…` matches every key that starts with it.
 */
const EXCEPTIONS = new Map<string, string>([
  ['apps/web/src/app/i18n/en.json drift.newer: sing-box', 'the fork binary version against the form schema'],
  ['apps/web/src/app/i18n/en.json drift.older: sing-box', 'the fork binary version against the form schema'],
  ['apps/web/src/widgets/Daemon/DaemonService/i18n/en.json row.binary: sing-box', 'the fork binary version'],
  ['apps/web/src/pages/Settings/i18n/en.json system.core: sing-box', 'the core type next to its version'],
  ['apps/web/src/widgets/Config/ConfigRawEditor/i18n/en.json issues: sing-box', '`sing-box check`'],
  ['apps/web/src/features/Config/ConfigCacheFile/i18n/en.json description: sing-box', 'the fork cache file'],
  ['apps/web/src/features/Config/ConfigNodeAdd/i18n/en.json description.parser: sing-box', 'a link the fork parses'],
  ['apps/web/src/app/i18n/ru.json drift.newer: sing-box', 'the fork binary version against the form schema'],
  ['apps/web/src/app/i18n/ru.json drift.older: sing-box', 'the fork binary version against the form schema'],
  ['apps/web/src/widgets/Daemon/DaemonService/i18n/ru.json row.binary: sing-box', 'the fork binary version'],
  ['apps/web/src/pages/Settings/i18n/ru.json system.core: sing-box', 'the core type next to its version'],
  ['apps/web/src/widgets/Config/ConfigRawEditor/i18n/ru.json issues: sing-box', '`sing-box check`'],
  ['apps/web/src/features/Config/ConfigCacheFile/i18n/ru.json description: sing-box', 'the fork cache file'],
  ['apps/web/src/features/Config/ConfigNodeAdd/i18n/ru.json description.parser: sing-box', 'a link the fork parses'],
  ['apps/web/src/pages/Proxies/i18n/en.json providers.dropCollapsed_one: sing-box', 'the fork subscription provider'],
  ['apps/web/src/pages/Proxies/i18n/en.json providers.dropCollapsed_other: sing-box', 'the fork subscription provider'],
  ['apps/web/src/pages/Proxies/i18n/ru.json providers.dropCollapsed_one: sing-box', 'the fork subscription provider'],
  ['apps/web/src/pages/Proxies/i18n/ru.json providers.dropCollapsed_few: sing-box', 'the fork subscription provider'],
  ['apps/web/src/pages/Proxies/i18n/ru.json providers.dropCollapsed_many: sing-box', 'the fork subscription provider'],
  [
    'apps/metaboxd/internal/locale/ru.go Reference for one sing-box config path…: sing-box',
    'an MCP tool for agents: names the fork and its schema',
  ],
  [
    'apps/metaboxd/internal/locale/ru.go Reference for one sing-box config path…: outbound',
    'an MCP tool for agents: quotes schema keys such as outbounds.*',
  ],
  [
    'apps/web/src/features/Config/ConfigApply/i18n/en.json check.exitCode: exit',
    'a process exit code, not an outbound',
  ],
  [
    'apps/metaboxd/internal/locale/ru.go sing-box exits on the saved subscription %q: %s: sing-box',
    'the fork cache file repair',
  ],
  [
    'apps/metaboxd/internal/locale/ru.go sing-box still exits on the saved subscription %q: %s: sing-box',
    'the fork cache file repair',
  ],
  [
    'apps/metaboxd/internal/locale/ru.go stop sing-box before editing the cache file: %w: sing-box',
    'the fork cache file repair',
  ],
  [
    'apps/metaboxd/internal/locale/ru.go sing-box did not start after the cache file was repaired: %w: sing-box',
    'the fork cache file repair',
  ],
  [
    'apps/metaboxd/internal/locale/ru.go sing-box exits on the saved subscription %q, but subscriptions are not cached in this config (store_subscriptions is off), so the daemon cannot repair it: sing-box',
    'the fork cache file repair',
  ],
  [
    'apps/metaboxd/internal/locale/ru.go sing-box could not start on the saved subscription %s. The daemon deleted its entry from the cache file; the next subscription update downloads it again: sing-box',
    'the fork cache file repair',
  ],
  [
    'apps/metaboxd/internal/locale/ru.go sing-box could not start on the saved subscription %s, and the cache file did not open. The daemon renamed the file to %s; sing-box downloads subscriptions and rule sets again: sing-box',
    'the fork cache file repair',
  ],
]);

interface Forbidden {
  lang: string;
  word: string;
}

interface Text {
  file: string;
  key: string;
  lang: string;
  text: string;
}

function forbiddenWords(): Forbidden[] {
  const glossary = readFileSync(path.join(REPO, GLOSSARY), 'utf8');
  const section = FORBIDDEN_SECTION.exec(glossary)?.[1] ?? '';

  return [...section.matchAll(FORBIDDEN_ITEM)].map(([, lang, word]) => ({ lang, word }));
}

function flatten(value: unknown, key: string, emit: (key: string, text: string) => void): void {
  if (typeof value === 'string') {
    emit(key, value);
  } else if (typeof value === 'object' && value !== null) {
    for (const [child, nested] of Object.entries(value)) {
      flatten(nested, key === '' ? child : `${key}.${child}`, emit);
    }
  }
}

function dictionaryTexts(): Text[] {
  return globSync(DICTIONARIES, { cwd: REPO }).flatMap((file) => {
    const lang = path.basename(file, '.json');
    const texts: Text[] = [];
    flatten(JSON.parse(readFileSync(path.join(REPO, file), 'utf8')), '', (key, text) =>
      texts.push({ file, key, lang, text })
    );

    return texts;
  });
}

function joinLiterals(chain: string): string {
  return [...chain.matchAll(LITERAL)].map(([, part]) => part).join('');
}

function daemonTexts(): Text[] {
  return [...readFileSync(path.join(REPO, DAEMON_CATALOGUE), 'utf8').matchAll(CATALOGUE_ENTRY)].map(
    ([, key, text]) => ({ file: DAEMON_CATALOGUE, key: joinLiterals(key), lang: 'ru', text: joinLiterals(text) })
  );
}

function wordStart(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${word.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu');
}

const WORD_SEPARATOR = ': ';

function splitWord(violation: string): [string, string] {
  const at = violation.lastIndexOf(WORD_SEPARATOR);

  return [violation.slice(0, at), violation.slice(at + WORD_SEPARATOR.length)];
}

function covers(exception: string, violation: string): boolean {
  const [where, word] = splitWord(exception);
  const [found, foundWord] = splitWord(violation);
  const matches = where.endsWith('…') ? found.startsWith(where.slice(0, -1)) : found === where;

  return matches && word === foundWord;
}

/** Every forbidden word in the texts, as `file key: word`, except the listed ones. */
function violations(texts: Text[], words: Forbidden[], exceptions: Map<string, string>): string[] {
  const patterns = words.map(({ lang, word }) => ({ lang, word, pattern: wordStart(word) }));

  return texts.flatMap(({ file, key, lang, text }) => {
    const value = text.replaceAll(PLACEHOLDER, '');

    return patterns
      .filter((word) => (word.lang === 'all' || word.lang === lang) && word.pattern.test(value))
      .map(({ word }) => `${file} ${key}: ${word}`)
      .filter((violation) => ![...exceptions.keys()].some((exception) => covers(exception, violation)));
  });
}

describe('vocabulary', () => {
  it('reads the forbidden words of the glossary and the daemon catalogue', () => {
    expect(forbiddenWords().length).toBeGreaterThan(MIN_FORBIDDEN);
    const catalogue = readFileSync(path.join(REPO, DAEMON_CATALOGUE), 'utf8');

    expect(daemonTexts().length).toBeGreaterThan(MIN_DAEMON_TEXTS);
    expect(daemonTexts()).toHaveLength(catalogue.match(CATALOGUE_KEY_LINE)?.length ?? 0);
  });

  it('names the file, the key and the word of every forbidden word, in its own language only', () => {
    const words = forbiddenWords();
    const texts = words.map(({ lang, word }, index) => ({
      file: 'fixture.json',
      key: `k${index}`,
      lang: lang === 'all' ? 'ru' : lang,
      text: `before ${word.toUpperCase()} after`,
    }));
    const otherLanguage = words
      .filter(({ lang }) => lang !== 'all')
      .map(({ lang, word }) => ({ file: 'fixture.json', key: 'other', lang: lang === 'en' ? 'ru' : 'en', text: word }));

    expect(violations(texts, words, new Map<string, string>())).toEqual(
      words.map(({ word }, index) => `fixture.json k${index}: ${word}`)
    );
    expect(violations(otherLanguage, words, new Map<string, string>())).toEqual([]);
  });

  it('skips placeholders, exceptions and a word that only contains a forbidden one', () => {
    const words = [{ lang: 'ru', word: 'нод' }];
    const texts = [
      { file: 'f.json', key: 'placeholder', lang: 'ru', text: 'через {{нода}}' },
      { file: 'f.json', key: 'inside', lang: 'ru', text: 'природа' },
      { file: 'f.json', key: 'excepted', lang: 'ru', text: 'нода' },
      { file: 'f.json', key: 'long key text', lang: 'ru', text: 'нода' },
    ];

    expect(
      violations(
        texts,
        words,
        new Map([
          ['f.json excepted: нод', 'a test exception'],
          ['f.json long key…: нод', 'a test exception by the start of the key'],
        ])
      )
    ).toEqual([]);
  });

  it('finds no forbidden word in the panel dictionaries and the daemon texts', () => {
    expect(
      violations([...dictionaryTexts(), ...daemonTexts()], forbiddenWords(), EXCEPTIONS),
      `a word ${GLOSSARY} forbids; reword the text or add an exception with its reason`
    ).toEqual([]);
  });

  it('keeps no exception for a text that no longer needs it', () => {
    const found = violations([...dictionaryTexts(), ...daemonTexts()], forbiddenWords(), new Map<string, string>());

    expect(
      [...EXCEPTIONS.keys()].filter((exception) => !found.some((violation) => covers(exception, violation)))
    ).toEqual([]);
  });
});
