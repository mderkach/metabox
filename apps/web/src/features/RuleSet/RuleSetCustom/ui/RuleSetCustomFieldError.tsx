import { useTranslation } from 'react-i18next';

import { RULE_SET_CUSTOM_ERROR, parseListEntries } from '../model/RuleSetCustom.schema';

export function RuleSetCustomFieldError({
  id,
  error,
  entries,
}: {
  id: string;
  error: string | undefined;
  entries: string;
}) {
  const { t } = useTranslation('features/RuleSet/RuleSetCustom');
  let text = error ?? null;

  switch (error) {
    case undefined:
      break;
    case RULE_SET_CUSTOM_ERROR.TagRequired:
      text = t('error.tagRequired');
      break;
    case RULE_SET_CUSTOM_ERROR.TagTaken:
      text = t('error.tagTaken');
      break;
    case RULE_SET_CUSTOM_ERROR.TagNotFileName:
      text = t('error.tagNotFileName');
      break;
    case RULE_SET_CUSTOM_ERROR.EntriesRequired:
      text = t('error.entriesRequired');
      break;
    case RULE_SET_CUSTOM_ERROR.EntryInvalid:
      text = t('error.entryInvalid', { entry: parseListEntries(entries).invalid ?? '' });
      break;
    default:
      break;
  }

  return text === null ? null : (
    <p id={id} role='alert' className='text-xs text-destructive'>
      {text}
    </p>
  );
}
