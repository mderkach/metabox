import { useTranslation } from 'react-i18next';

import { CONFIG_NODE_ADD_NS } from '../i18n/ConfigNodeAdd.namespace.generated';

/** Link to the fork's documentation page of the chosen node type. */
export function ConfigNodeAddDocsLink({ type, url }: { type: string; url: string }) {
  const { t } = useTranslation(CONFIG_NODE_ADD_NS);

  return (
    <a
      href={url}
      target='_blank'
      rel='noreferrer'
      className='self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground'
    >
      {t('docs.link', { type })}
    </a>
  );
}
