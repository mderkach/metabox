import { sectionSettingsPath, sectionSettingsSchema, type SettingsSection } from '@entities/Config';

import type { ConfigNodeFormModel } from '../model';
import { ConfigNodeFormBody } from './ConfigNodeForm';

/**
 * Section fields as a form by the section schema without its lists: scalars of
 * `route` or `dns`, the whole `experimental`. The same leaf write as in the
 * node form, so editing one field is one diff line, while rules, sets and
 * servers nearby are not touched.
 *
 * `settings` are section fields accepted by the schema
 * (`isSectionSettingsRecognized`): the resolver would not pass an unfamiliar
 * key, and the form would not save at all.
 */
export function ConfigSectionForm({ section, settings }: { section: SettingsSection; settings: ConfigNodeFormModel }) {
  return (
    <ConfigNodeFormBody
      schema={sectionSettingsSchema(section)}
      override={null}
      path={sectionSettingsPath(section)}
      node={settings}
      builtTags={null}
    />
  );
}
