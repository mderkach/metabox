import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RuleTester } from 'oxlint/plugins-dev';
import { afterAll, describe, it } from 'vitest';

import plugin from './fsdBoundaries.js';

RuleTester.describe = describe;
RuleTester.it = it;

const root = mkdtempSync(path.join(tmpdir(), 'metabox-fsd-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function index(directory) {
  const location = path.join(root, directory);
  mkdirSync(location, { recursive: true });
  writeFileSync(path.join(location, 'index.ts'), '');
}

for (const directory of [
  'src/entities/Config',
  'src/entities/Daemon',
  'src/features/Rule/RuleEdit',
  'src/widgets/RouteExplanation',
  'src/pages/Editor',
  'src/shared/api',
  'src/shared/ui',
  'src/shared/lib/state',
])
  index(directory);

function sample(filename, code) {
  return { filename: path.join(root, filename), code };
}

function rejected(filename, code, message) {
  return { ...sample(filename, code), errors: [{ message }] };
}

const page = 'src/pages/Editor/ui/Editor.tsx';
const test = 'src/widgets/RouteExplanation/__tests__/RouteExplanation.test.tsx';
const privateApi = /bypassing the Public API/;
const ancestorRoot = path.join(root, 'src/repository/apps/web');
mkdirSync(path.join(ancestorRoot, 'src/shared/ui'), { recursive: true });
writeFileSync(path.join(ancestorRoot, 'src/shared/ui/index.ts'), '');

const sameLayer = /neighboring slice|Within a layer/;
const restricted = /test|mocks|dev/;

const tester = new RuleTester();
tester.run('boundaries', plugin.rules.boundaries, {
  valid: [
    sample('src/shared/api/ApiClient.ts', "import type { Dto } from './daemon.generated';"),
    sample('src/repository/apps/web/mocks/browser.ts', "import { x } from '@shared/ui';"),
    sample(page, "import { value } from '@entities/Config';"),
    sample(page, "export { value } from '@entities/Config';"),
    sample(page, "export * from '@entities/Config';"),
    sample(page, "import('@entities/Config');"),
    sample(
      'src/widgets/Config/ConfigRawEditor/__tests__/ConfigRawEditor.bench.ts',
      "import { toJsonTokens } from '@shared/ui/JsonTextarea.lib';"
    ),
    sample(page, 'import(`@entities/Config`);'),
    sample(page, 'import(destination); import(`@entities/${name}`);'),
    sample(page, "import { value } from '../model/Editor';"),
    sample(page, "import { value } from '@shared/lib/time'; import { cn } from '@shared/lib/utils';"),
    sample('src/shared/ui/shadcn/button.tsx', "import { cn } from '../../lib/utils';"),
    sample('src/shared/ui/Button.tsx', "import { value } from './styles';"),
    sample('src/shared/ui/Button.tsx', "import { value } from '../lib/state';"),
    sample('src/entities/Config/model/Config.ts', "import { x } from '@shared/api/../api/generated.ts';"),
    sample('src/entities/Config/api/Config.ts', "import type { Config } from '@shared/api/generated';"),
    sample('src/entities/Config/model/Config.ts', "import('@shared/api/daemon.generated');"),
    sample(test, "import { value } from '@shared/api/generated';"),
    sample(test, "import { value } from '@entities/Config/__tests__/Config.fixture';"),
    sample('src/entities/Config/__tests__/Config.test.ts', "import { value } from '@entities/Daemon';"),
    sample('src/entities/Config/model/Config.ts', "import { value } from '@entities/Daemon/@x/config';"),
    sample(test, "import { value } from '@test/render';"),
    sample(test, "import { x } from '@shared/ui/__tests__/fixture';"),
    sample('mocks/browser.ts', "import { x } from '@shared/lib/__tests__/fixture';"),
    sample('src/test/handlers.ts', "import { value } from '@entities/Config/__tests__/Config.handlers';"),
    sample('src/test/setup.ts', "import { value } from './handlers';"),
    sample('mocks/browser.ts', "import { value } from '../src/test/handlers';"),
    sample('mocks/enable.ts', "import { worker } from './browser'; import(APP_ENTRY);"),
    sample('mocks/browser.ts', "import { value } from '@test/handlers'; import { x } from '@entities/Config';"),
    sample('dev/scan.ts', "import 'react-scan'; import './local'; import('@shared/ui');"),
    {
      ...sample(page, "import { value } from '@entities/NewEntity';"),
      before() {
        index('src/entities/NewEntity');
      },
      after() {
        rmSync(path.join(root, 'src/entities/NewEntity'), { recursive: true });
      },
    },
  ],
  invalid: [
    rejected('src/entities/Config/model/Config.ts', "import { x } from '../__tests__/Config.fixture';", restricted),
    rejected(page, "import { x } from '@shared/lib/__tests__/fixture';", privateApi),
    rejected('src/entities/Config/api/Config.ts', "import { x } from '@shared/api/nested/generated';", privateApi),
    rejected(page, "import { x } from '@shared/api/../api/generated.ts';", /generated shape/),
    rejected('src/repository/apps/web/mocks/browser.ts', "import { x } from '@shared/ui/Button';", privateApi),
    rejected('src/entities/Config/model/Config.ts', "import { value } from '@pages/Editor';", /Upward/),
    rejected(page, "import('@features/Rule/RuleEdit/ui/RuleEdit');", privateApi),
    rejected(page, 'import(`@features/Rule/RuleEdit/ui/RuleEdit`);', privateApi),
    rejected(page, 'import(`@features/Rule/RuleEdit/ui/Rule\\u0045dit`);', privateApi),
    rejected(page, "export { value } from '@entities/Config/model/Config';", privateApi),
    rejected(page, "export * from '@entities/Config/model/Config';", privateApi),
    rejected(page, "import { value } from '@features/Rule';", /no Public API/),
    rejected(page, "import { value } from '@shared/ui/Button';", privateApi),
    rejected(
      'src/widgets/Config/ConfigRawEditor/__tests__/Other.bench.ts',
      "import { toJsonTokens } from '@shared/ui/JsonTextarea.lib';",
      privateApi
    ),
    rejected(
      'src/widgets/Config/ConfigRawEditor/__tests__/ConfigRawEditor.bench.ts',
      "import { value } from '@shared/ui/Button';",
      privateApi
    ),
    rejected(page, "import('@shared/lib/state/stateCreator');", privateApi),
    rejected('src/shared/ui/Button.tsx', "import { value } from '../lib/state/stateCreator';", privateApi),
    rejected('src/shared/ui/Button.tsx', "import { value } from '@shared/ui';", sameLayer),
    rejected('src/entities/Config/model/Config.ts', "import { value } from '@entities/Daemon';", sameLayer),
    rejected(
      'src/entities/Config/model/Config.ts',
      "import { value } from '../../Daemon/model/Daemon';",
      /left the slice/
    ),
    rejected(page, "import { value } from '../../../entities/Config';", /only via the alias/),
    rejected(page, "import { value } from '@shared/api/generated';", /generated shape/),
    rejected(page, "import { value } from '@entities/Daemon/@x/config';", /own layer/),
    rejected(
      'src/entities/Config/model/Config.ts',
      "import { value } from '@entities/Daemon/@x/route';",
      /open to slice/
    ),
    rejected(page, "import { value } from '@test/render';", restricted),
    rejected(page, "import { value } from '../../../test/handlers';", restricted),
    rejected('src/app/main.tsx', "import('../../mocks/browser');", restricted),
    rejected('src/app/main.tsx', "import('../../dev/scan');", restricted),
    rejected('src/app/main.tsx', "import { x } from '@shared/../test/handlers';", restricted),
    rejected('dev/scan.ts', "import { value } from '@test/handlers';", restricted),
    rejected('dev/scan.ts', "import { value } from '@entities/Config/__tests__/Config.fixture';", privateApi),
    rejected('mocks/browser.ts', "import { value } from '@entities/Config/model/Config';", privateApi),
    rejected('src/test/handlers.ts', "import { value } from '@entities/Config/model/Config';", privateApi),
    rejected('mocks/browser.ts', "import { value } from '@entities/Daemon/@x/config';", /own layer/),
    rejected('dev/scan.ts', "import { value } from '@shared/ui/Button';", privateApi),
  ],
});

tester.run('slice-name', plugin.rules['slice-name'], {
  valid: [sample('src/features/Rule/RuleEdit/ui/RuleEdit.tsx', 'export {};')],
  invalid: [
    {
      ...sample('src/features/Rule/Edit/ui/Edit.tsx', 'export {};'),
      before() {
        index('src/features/Rule/Edit');
      },
      after() {
        rmSync(path.join(root, 'src/features/Rule/Edit'), { recursive: true });
      },
      errors: [{ message: /named `Rule/ }],
    },
  ],
});

for (const exists of [false, true, false]) {
  const entry = sample(page, "import { value } from '@entities/Changing';");
  entry.before = () => {
    if (exists) index('src/entities/Changing');
    else rmSync(path.join(root, 'src/entities/Changing'), { recursive: true, force: true });
  };
  tester.run(`public API on disk: ${exists}`, plugin.rules.boundaries, {
    valid: exists ? [entry] : [],
    invalid: exists ? [] : [{ ...entry, errors: [{ message: /no Public API/ }] }],
  });
}
