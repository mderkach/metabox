import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ConfigIssue } from '@entities/Config';
import { Alert, AlertDescription, AlertTitle } from '@shared/ui';

/** How many schema remarks to show so they do not crowd out the screen. */
const VISIBLE_ISSUES = 5;

/**
 * The config arrived but the schema did not accept it.
 *
 * An empty rule list instead of this message would read as "no rules", and the
 * user would start fixing the wrong thing. Schema remarks are shown verbatim:
 * they show which node is not parsed.
 */
export function EditorConfigNotParsed({ issues }: { issues: ConfigIssue[] }) {
  const { t } = useTranslation('pages/Editor');
  const shown = issues.slice(0, VISIBLE_ISSUES);
  const hidden = issues.length - shown.length;

  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>{t('broken.title')}</AlertTitle>
      <AlertDescription>
        <p className='text-pretty'>{t('broken.description')}</p>
        <ul className='mt-2 flex flex-col gap-1 font-mono text-xs'>
          {shown.map((issue) => (
            <li key={issue.text}>{issue.text}</li>
          ))}
        </ul>
        {hidden > 0 && <p className='mt-1 text-xs'>{t('broken.more', { count: hidden })}</p>}
      </AlertDescription>
    </Alert>
  );
}
