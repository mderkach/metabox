import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@test/server';
import { renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEVICE_ENDPOINT } from '@entities/Device';

import { toRuleRowsFromNodes } from '../model/Rule.adapter';
import { useRuleTitle } from '../ui/useRuleTitle';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      {children}
    </QueryClientProvider>
  );
}

describe('useRuleTitle', () => {
  beforeEach(() => {
    server.use(http.get(DEVICE_ENDPOINT.devices(), () => HttpResponse.json({ devices: [] })));
  });
  it.each(['true', 'false', 'Правило 1'])('keeps textual condition %s and its outbound', (tag) => {
    const { result } = renderHook(useRuleTitle, { wrapper });
    const rule = toRuleRowsFromNodes([{ rule_set: [tag], outbound: 'proxy' }])[0];

    expect(result.current.subject(rule)).toBe(tag);
    expect(result.current.title(rule)).toContain('proxy');
  });

  it('names actual boolean flags and keeps numbered fallback separate', () => {
    const { result } = renderHook(useRuleTitle, { wrapper });
    const flag = toRuleRowsFromNodes([{ ip_is_private: true, outbound: 'proxy' }])[0];
    const unknown = toRuleRowsFromNodes([{ unknown_matcher: 'x', outbound: 'proxy' }])[0];

    expect(result.current.subject(flag)).not.toBe('true');
    expect(result.current.title(flag)).toContain('proxy');
    expect(result.current.title(unknown)).toBe('Правило 1');
  });
});
