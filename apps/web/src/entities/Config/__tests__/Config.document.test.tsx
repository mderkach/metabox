import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT } from '../api/Config.endpoints';
import { useConfigDocument } from '../model/Config.document';
import { ConfigDocumentState } from '../model/Config.store';
import { CONFIG_FIXTURE } from './Config.fixture';
import { configHandlers } from './Config.handlers';

const EDITED = JSON.stringify({ ...CONFIG_FIXTURE, log: { ...CONFIG_FIXTURE.log, level: 'debug' } }, null, 2);

/** The schema will not accept it: `inbounds` must be a list. */
const REJECTED = JSON.stringify({ ...CONFIG_FIXTURE, inbounds: 'не список' }, null, 2);

function renderDocument() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return renderHook(useConfigDocument, { wrapper: Wrapper });
}

describe('useConfigDocument', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    server.use(
      ...configHandlers,
      http.get(CONFIG_ENDPOINT.ruleSetFiles(), () => HttpResponse.json({ files: {}, etag: '"lists"' }))
    );
  });

  // Parsing is deferred behind the input: the text and the edits flag must not wait for it.
  it('after an edit the text and the edits flag update at once, and the parsed document catches up', async () => {
    const { result } = renderDocument();

    await waitFor(() => {
      expect(result.current.config).not.toBeNull();
    });

    act(() => {
      ConfigDocumentState.getState().replace(EDITED);
    });

    expect(result.current.text).toBe(EDITED);
    expect(result.current.isDirty).toBe(true);

    await waitFor(() => {
      expect(result.current.config?.log?.level).toBe('debug');
    });
    expect(result.current.issues).toEqual([]);
  });

  it('a draft the schema did not accept yields issues and an empty document, and keeps the text', async () => {
    const { result } = renderDocument();

    await waitFor(() => {
      expect(result.current.config).not.toBeNull();
    });

    act(() => {
      ConfigDocumentState.getState().replace(REJECTED);
    });

    expect(result.current.text).toBe(REJECTED);

    await waitFor(() => {
      expect(result.current.config).toBeNull();
    });
    expect(result.current.issues.length).toBeGreaterThan(0);
  });
});
