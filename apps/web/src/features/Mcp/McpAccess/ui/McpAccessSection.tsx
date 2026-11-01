import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMcp } from '@entities/Mcp';
import { CARD_TITLE, Card, CardContent, CardHeader } from '@shared/ui';

import { McpAccessBody } from './McpAccessBody';

/**
 * MCP access on the settings screen. Hidden while the daemon has not answered about MCP:
 * an older daemon without the endpoint has nothing to switch.
 */
export function McpAccessSection() {
  const { t } = useTranslation('features/Mcp/McpAccess');
  const mcp = useMcp();
  // "Done" after a token remounts the body: the issued token lives in its mutation and goes with it.
  const [round, setRound] = useState(0);

  if (!mcp.isSuccess) {
    return null;
  }

  return (
    <Card>
      <CardHeader className='flex flex-col gap-1'>
        <h3 className={CARD_TITLE}>{t('title')}</h3>
        <p className='max-w-prose text-sm text-pretty text-muted-foreground'>
          {t(mcp.data.enabled ? 'description.on' : 'description.off')}
        </p>
      </CardHeader>
      <CardContent className='max-w-xl'>
        <McpAccessBody
          key={round}
          enabled={mcp.data.enabled}
          endpoint={mcp.data.endpoint}
          permissions={mcp.data.permissions}
          onDone={() => {
            setRound((count) => count + 1);
          }}
        />
      </CardContent>
    </Card>
  );
}
