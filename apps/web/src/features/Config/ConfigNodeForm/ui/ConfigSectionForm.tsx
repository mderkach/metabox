import { sectionSettingsPath, sectionSettingsSchema, type SettingsSection } from '@entities/Config';

import type { ConfigNodeFormModel } from '../model';
import { ConfigNodeFormBody } from './ConfigNodeForm';

/**
 * Скаляры секции `route` или `dns` формой по схеме секции без её списков:
 * та же запись листьями, что у формы узла, поэтому правка одного поля — одна
 * строка дифа, а правила, сеты и серверы рядом не трогаются.
 *
 * `settings` — скаляры, принятые схемой (`isSectionSettingsRecognized`):
 * незнакомый ключ резолвер не пропустил бы, и форма не сохранилась бы вовсе.
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
