import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { test as base } from '@playwright/test';

const run = promisify(execFile);

const COMPOSE = path.resolve(import.meta.dirname, '../../../../.devcontainer/docker-compose.yml');
/** The Clash API traffic stream never ends, so a request to it stays an open connection. */
const HELD_URL = 'http://127.0.0.1:9090/traffic';
/** The mixed inbound of the bench config: a request through it is a sing-box connection. */
const BENCH_PROXY = 'http://127.0.0.1:2080';

async function target(command: string, detach = false) {
  await run('docker', [
    'compose',
    '-f',
    COMPOSE,
    'exec',
    '-T',
    ...(detach ? ['-d'] : []),
    'target',
    'sh',
    '-c',
    command,
  ]);
}

/**
 * A connection through sing-box held open on the bench for the test: the bench has no traffic of its own when the
 * scenarios run. The fixture value is its address as the connection list shows it.
 */
export const test = base.extend<{ benchConnection: string }>({
  // oxlint-disable-next-line eslint/no-empty-pattern -- Playwright reads fixture dependencies from a destructured first argument
  benchConnection: async ({}, use) => {
    await target(`http_proxy=${BENCH_PROXY} exec wget -q -O /dev/null ${HELD_URL}`, true);
    await use(new URL(HELD_URL).host);
    await target(`pkill -f '[9]090/traffic' || true`);
  },
});
