import { useTranslation } from 'react-i18next';

/** Link to the fork's documentation page of the chosen node type. */
export function ConfigNodeAddDocsLink({ type, url }: { type: string; url: string }) {
  const { t } = useTranslation('features/Config/ConfigNodeAdd');

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
