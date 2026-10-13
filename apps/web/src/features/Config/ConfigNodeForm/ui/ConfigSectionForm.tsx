import { sectionSettingsPath, sectionSettingsSchema, type SettingsSection } from '@entities/Config';

import type { ConfigNodeFormModel } from '../model';
import { ConfigNodeFormBody } from './ConfigNodeForm';

/**
 * Section scalars of `route` or `dns` as a form by the section schema without
 * its lists: the same leaf write as in the node form, so editing one field is
 * one diff line, while rules, sets and servers nearby are not touched.
 *
 * `settings` are scalars accepted by the schema
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
