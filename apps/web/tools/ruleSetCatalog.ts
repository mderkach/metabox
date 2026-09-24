import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { RULE_SET_PROVIDERS, SET_EXTENSION } from '../src/entities/RuleSet/model/RuleSet.constants.ts';

/**
 * Перечень категорий каталога наборов: снимок файлов, которые поставщик
 * публикует в своей ветке. Берётся список `.srs`, а не разбор `geosite.dat`:
 * категория без готового файла дала бы адрес, по которому sing-box ничего не
 * скачает и не стартует.
 *
 * Дерево читается у GitHub-зеркала поставщика. Без сети панель обязана
 * открывать каталог, поэтому снимок коммитится и едет вместе с ней.
 */

const OUT_FILE = 'src/entities/RuleSet/model/RuleSet.categories.generated.json';
/** Отступ как у oxfmt: иначе `pnpm format` переписывал бы снимок после каждой генерации. */
const JSON_INDENT = 2;

/** `raw.githubusercontent.com/<владелец>/<репозиторий>/<ветка>/<каталог>/`. */
const GITHUB_RAW = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.*?)\/?$/u;

interface TreeResponse {
  truncated: boolean;
  tree: { path: string; type: string }[];
}

function treeURL(base: string): string {
  const match = GITHUB_RAW.exec(base);

  if (match === null) {
    throw new Error(`[RULE-SETS] не GitHub-адрес: ${base}`);
  }

  const [, owner, repo, ref, dir] = match;
  const target = dir === '' ? ref : `${ref}:${dir}`;

  return `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(target)}`;
}

async function listCategories(base: string, prefix: string): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(treeURL(base), {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token !== undefined && token !== '' && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    throw new Error(`[RULE-SETS] ${base}: ${response.status} ${response.statusText}`);
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ответ GitHub API, форма описана в его документации
  const body = (await response.json()) as TreeResponse;

  // Урезанное дерево дало бы каталог без части категорий, и это не было бы видно.
  if (body.truncated) {
    throw new Error(`[RULE-SETS] ${base}: GitHub отдал дерево не целиком`);
  }

  return body.tree
    .filter((entry) => entry.type === 'blob')
    .map((entry) => entry.path)
    .filter((name) => name.startsWith(prefix) && name.endsWith(SET_EXTENSION.Binary))
    .map((name) => name.slice(prefix.length, -SET_EXTENSION.Binary.length))
    .toSorted();
}

const catalog: Record<string, string[]> = {};

for (const provider of RULE_SET_PROVIDERS) {
  const github = provider.mirrors.find((mirror) => GITHUB_RAW.test(mirror.base));

  if (github === undefined) {
    throw new Error(`[RULE-SETS] у поставщика ${provider.id} нет GitHub-зеркала`);
  }

  catalog[provider.id] = await listCategories(github.base, provider.prefix);
  console.log(`[RULE-SETS] ${provider.id}: ${catalog[provider.id].length}`);
}

writeFileSync(path.resolve(OUT_FILE), `${JSON.stringify(catalog, null, JSON_INDENT)}\n`);
