import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentStore } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { buildRuleSetURL, RULE_SET_ENDPOINT, toRuleSetCatalog } from '@entities/RuleSet';
import { RULE_SET_CATALOG_FIXTURE } from '@entities/RuleSet/__tests__/RuleSet.fixture';
import { Dialog } from '@shared/ui';

import { RuleCatalogAddDialog } from '../ui/RuleCatalogAddDialog';

const LIST = toRuleSetCatalog(RULE_SET_CATALOG_FIXTURE).providers[0].lists[0];
const OUTBOUNDS = [{ type: 'direct', tag: 'direct' }];
const TEXT = JSON.stringify({
  inbounds: [
    { type: 'socks', tag: 'client', listen: '127.0.0.1', listen_port: 1080 },
    { type: 'direct', tag: 'queries', listen: '127.0.0.1', listen_port: 1053, network: 'udp' },
  ],
  outbounds: OUTBOUNDS,
  route: {
    rule_set: [
      { type: 'remote', tag: 'video', format: 'binary', url: buildRuleSetURL(LIST, LIST.mirrors[0].id, 'youtube') },
    ],
    rules: [{ inbound: ['queries'], action: 'hijack-dns' }],
  },
  dns: {
    servers: [{ type: 'tcp', tag: 'local-dns', server: '192.0.2.1' }],
    rules: [{ rule_set: ['video'], action: 'route', server: 'local-dns' }],
  },
});

function openDialog(variant: string) {
  ConfigDocumentStore.getState().load(TEXT);
  server.use(
    http.get(RULE_SET_ENDPOINT.catalog(), () => HttpResponse.json(RULE_SET_CATALOG_FIXTURE)),
    http.get(DAEMON_ENDPOINT.status(), () =>
      HttpResponse.json({
        ...DAEMON_STATUS_FIXTURE,
        core: { type: 'sing-box', variant, version: '1.14.3-extended-2.7.3' },
      })
    )
  );
  renderWithQuery(
    <Dialog open>
      <RuleCatalogAddDialog
        text={TEXT}
        outbounds={OUTBOUNDS}
        stagedTags={new Set()}
        initialService='youtube'
        onAdded={vi.fn<() => void>()}
        finalFocus={false}
      />
    </Dialog>
  );
}

describe('RuleCatalogAddDialog', () => {
  afterEach(() => {
    ConfigDocumentStore.getState().reset();
  });

  it('retains a concurrent draft edit when the reviewed catalog pair is submitted', async () => {
    openDialog('extended');
    const user = userEvent.setup();
    const add = await screen.findByRole('button', { name: 'Добавить в черновик' });

    await waitFor(() => expect(add).toBeEnabled());
    ConfigDocumentStore.getState().edit(['log', 'level'], 'warn');
    const concurrent = ConfigDocumentStore.getState().draft;
    await user.click(add);

    expect(await screen.findByRole('alert')).toHaveTextContent('Черновик изменился');
    expect(ConfigDocumentStore.getState().draft).toBe(concurrent);
  });

  it('blocks an unknown core variant even if it reports the tested version number', async () => {
    openDialog('unknown');

    expect(await screen.findByText(/для текущего ядра/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить в черновик' })).toBeDisabled();
    expect(ConfigDocumentStore.getState().draft).toBeNull();
  });
});
