import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { expectedI18nArtifacts, isGeneratedNamespace, writeI18nArtifacts } from './i18n.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(projectRoot, '../..');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'metabox-locales-'));
  roots.push(root);

  return root;
}

function addDictionary(root, namespace) {
  const directory = path.join(root, 'src', namespace, 'i18n');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'ru.json'), '{"title":"Заголовок"}');

  return directory;
}

function artifactMismatches(expected, committed) {
  const problems = [];

  for (const [file, wanted] of expected) {
    const actual = committed.get(file);
    if (actual === undefined) problems.push(`missing: ${file}`);
    else if (actual !== wanted) problems.push(`changed: ${file}`);
  }
  for (const [file, content] of committed) {
    if (!expected.has(file) && isGeneratedNamespace(content)) problems.push(`obsolete: ${file}`);
  }

  return problems.toSorted();
}

describe('i18n generator', () => {
  it('keeps each namespace with its dictionary and preserves mtimes when only translation text changes', () => {
    const root = fixture();
    const directory = addDictionary(root, 'pages/RuleSets');
    const other = addDictionary(root, 'widgets/RuleSets');
    const module = path.join(directory, 'RuleSets.namespace.generated.ts');
    const types = path.join(root, 'src/i18n.generated.d.ts');

    writeI18nArtifacts(root);

    expect(readFileSync(module, 'utf8')).toContain("export const RULE_SETS_NS = 'pages/RuleSets' as const;");
    expect(readFileSync(path.join(other, 'RuleSets.namespace.generated.ts'), 'utf8')).toContain("'widgets/RuleSets'");
    expect(readFileSync(types, 'utf8')).toContain("'pages/RuleSets': typeof import('./pages/RuleSets/i18n/ru.json')");
    const mtimes = [module, types].map((file) => statSync(file, { bigint: true }).mtimeNs);
    writeFileSync(path.join(directory, 'ru.json'), '{"title":"Новое название"}');
    writeI18nArtifacts(root);
    expect([module, types].map((file) => statSync(file, { bigint: true }).mtimeNs)).toEqual(mtimes);
  });

  it('renames and removes only generator-owned namespace files', () => {
    const root = fixture();
    const directory = addDictionary(root, 'pages/Before');
    const renamed = path.join(root, 'src/pages/After/i18n');
    const handwritten = 'Keep.namespace.generated.ts';

    writeFileSync(path.join(directory, handwritten), 'export const keep = true;');
    writeI18nArtifacts(root);
    renameSync(path.dirname(directory), path.dirname(renamed));
    writeI18nArtifacts(root);

    expect(existsSync(path.join(renamed, 'Before.namespace.generated.ts'))).toBe(false);
    expect(readFileSync(path.join(renamed, 'After.namespace.generated.ts'), 'utf8')).toContain("'pages/After'");
    rmSync(path.join(renamed, 'ru.json'));
    writeI18nArtifacts(root);
    expect(existsSync(path.join(renamed, 'After.namespace.generated.ts'))).toBe(false);
    expect(readFileSync(path.join(renamed, handwritten), 'utf8')).toBe('export const keep = true;');
    expect(readFileSync(path.join(root, 'src/i18n.generated.d.ts'), 'utf8')).not.toContain('pages/After');
  });

  it('refuses to replace a handwritten namespace file before updating any artifact', () => {
    const root = fixture();
    const directory = addDictionary(root, 'pages/Overview');
    const file = path.join(directory, 'Overview.namespace.generated.ts');

    writeFileSync(file, 'export const kept = true;');
    expect(() => writeI18nArtifacts(root)).toThrow('handwritten file');
    expect(readFileSync(file, 'utf8')).toBe('export const kept = true;');
    expect(existsSync(path.join(root, 'src/i18n.generated.d.ts'))).toBe(false);
  });

  it('checks expected contents and counts only marked orphans as stale', () => {
    const root = fixture();
    addDictionary(root, 'pages/Overview');
    addDictionary(root, 'pages/Settings');

    const expected = expectedI18nArtifacts(root);
    const committed = new Map(expected);
    const overview = 'src/pages/Overview/i18n/Overview.namespace.generated.ts';
    const settings = 'src/pages/Settings/i18n/Settings.namespace.generated.ts';
    const orphan = 'src/pages/Settings/i18n/Before.namespace.generated.ts';

    committed.set('src/pages/Settings/i18n/Keep.namespace.generated.ts', 'export const keep = true;');
    expect(artifactMismatches(expected, committed)).toEqual([]);

    committed.set(orphan, committed.get(settings));
    committed.delete(settings);
    committed.set(overview, 'export const overwritten = true;');
    expect(artifactMismatches(expected, committed)).toEqual([
      `changed: ${overview}`,
      `missing: ${settings}`,
      `obsolete: ${orphan}`,
    ]);
  });

  // Vitest regenerates the artifacts at startup. Only the committed tree can expose stale files.
  it('commits the complete generated set for the dictionaries on disk', () => {
    const expected = expectedI18nArtifacts(projectRoot);
    const git = { cwd: repoRoot, encoding: 'utf8' };
    const files = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', 'apps/web/src'], git);
    const committed = new Map();

    for (const file of files.split('\0')) {
      const relative = file.slice('apps/web/'.length);
      if (expected.has(relative) || /\/i18n\/[^/]+\.namespace\.generated\.ts$/u.test(relative)) {
        committed.set(relative, execFileSync('git', ['show', `HEAD:${file}`], git));
      }
    }

    expect(artifactMismatches(expected, committed), 'run pnpm --filter web gen:i18n').toEqual([]);
  });
});
