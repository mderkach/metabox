import { useLiveRegion } from '@shared/lib/useLiveRegion';
import { LiveRegion } from '@shared/ui';

import { useDisableMcp, useIssueMcpToken } from '../api';
import { toMcpUrl } from '../model';
import { McpAccessOff } from './McpAccessOff';
import { McpAccessOn } from './McpAccessOn';
import { McpAccessToken } from './McpAccessToken';

/**
 * Dialog content, mounted per opening: the issued token lives in the mutation of this
 * component and goes away with it when the dialog closes.
 */
export function McpAccessBody({
  enabled,
  endpoint,
  permissions,
  onDone,
}: {
  enabled: boolean;
  endpoint: string;
  permissions: readonly string[];
  onDone: () => void;
}) {
  const issue = useIssueMcpToken();
  const disable = useDisableMcp();
  const { message, announce } = useLiveRegion();
  const pending = issue.isPending || disable.isPending;

  function onIssue() {
    issue.mutate();
  }

  function onDisable() {
    disable.mutate();
  }

  const url = toMcpUrl(window.location.origin, issue.data?.endpoint ?? endpoint);

  return (
    <>
      <LiveRegion message={message} />
      {issue.data !== undefined && (
        <McpAccessToken token={issue.data.token} url={url} announce={announce} onDone={onDone} />
      )}
      {issue.data === undefined && enabled && (
        <McpAccessOn
          url={url}
          permissions={permissions}
          pending={pending}
          onRegenerate={onIssue}
          onDisable={onDisable}
        />
      )}
      {issue.data === undefined && !enabled && <McpAccessOff pending={pending} onEnable={onIssue} />}
    </>
  );
}
