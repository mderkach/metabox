import type { TFunction } from 'i18next';

import type { CONFIG_NODE_ADD_NS } from '../i18n/ConfigNodeAdd.namespace.generated';
import { NODE_ADD_ERROR } from './ConfigNodeAdd.schema';

/** Schema failure code into text; an unrecognized string is named as itself. */
export function nodeAddErrorText(t: TFunction<typeof CONFIG_NODE_ADD_NS>, error: string | undefined): string | null {
  switch (error) {
    case undefined:
      return null;
    case NODE_ADD_ERROR.TypeRequired:
      return t('error.typeRequired');
    case NODE_ADD_ERROR.TagRequired:
      return t('error.tagRequired');
    case NODE_ADD_ERROR.TagTaken:
      return t('error.tagTaken');
    default:
      return error;
  }
}
