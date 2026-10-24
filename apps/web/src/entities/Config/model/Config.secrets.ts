import { SECRET_FIELD_KEYS } from '@shared/api/generated';

/**
 * Config keys whose values are credentials, as the fork schema names them; lower case. A
 * form hides such a field whole wherever the key sits, and the daemon masks MCP results by
 * the same catalogue.
 */
export const CONFIG_SECRET_KEYS: ReadonlySet<string> = new Set(SECRET_FIELD_KEYS);
