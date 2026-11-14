// Size budget of the first screen: the entry script plus every chunk `index.html` preloads.
// The list is read from the built `index.html`, not from a Vite manifest: the manifest would land
// in `dist` and from there in the daemon binary, and the page is what the browser actually fetches.
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Raw bytes of the entry plus its preloads. Raised only together with the reason in the PR. */
export const BUDGET_BYTES = 650_000;

/** Chunks that must load with their screens, never with the first page: the fork schema. */
export const FORBIDDEN_CHUNKS = [/^generated-/];

/** Width of the byte column in the printed list. */
const SIZE_WIDTH = 8;

const SCRIPT_PATTERN = /<(?:script[^>]*\ssrc|link[^>]*\srel="modulepreload"[^>]*\shref)="\/([^"]+\.js)"/g;

/** Asset paths of the entry script and the modulepreload links, relative to `dist`. */
export function initialScripts(html) {
  return [...html.matchAll(SCRIPT_PATTERN)].map((match) => match[1]);
}

/** Violations of the budget for the given `{ path, bytes }` list; an empty list passes. */
export function checkBudget(files, budget = BUDGET_BYTES, forbidden = FORBIDDEN_CHUNKS) {
  const problems = files
    .filter((file) => forbidden.some((pattern) => pattern.test(path.basename(file.path))))
    .map((file) => `${file.path} must not be preloaded by the first page`);
  const total = files.reduce((sum, file) => sum + file.bytes, 0);

  if (total > budget) {
    problems.push(`entry plus preloads take ${total} bytes, over the budget of ${budget}`);
  }

  return problems;
}

function main() {
  const dist = path.resolve(import.meta.dirname, '../dist');
  const files = initialScripts(readFileSync(path.join(dist, 'index.html'), 'utf8')).map((file) => ({
    path: file,
    bytes: readFileSync(path.join(dist, file)).byteLength,
  }));

  for (const file of files) {
    console.log(`${String(file.bytes).padStart(SIZE_WIDTH)}  ${file.path}`);
  }

  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`${String(total).padStart(SIZE_WIDTH)}  total of ${files.length} files, budget ${BUDGET_BYTES}`);

  const problems = checkBudget(files);

  for (const problem of problems) {
    console.error(`[BUNDLE] ${problem}`);
  }

  process.exitCode = problems.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  main();
}
