import { readFileSync } from 'node:fs';
import { ConfigSchema, SCHEMA_FORK_VERSION } from '../../../apps/web/src/shared/api/generated.ts';

const [, , ...files] = process.argv;
if (files.length === 0) throw new Error('Pass at least one fixture config.json');

for (const file of files) {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const result = ConfigSchema.safeParse(config);
  if (!result.success) throw new Error(`${file}: ${result.error.message}`);
}

console.log(`ConfigSchema ${SCHEMA_FORK_VERSION}: ${files.length} configs passed`);
