import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { CONFIG_ENDPOINT } from '@entities/Config';
import { CONFIG_FIXTURE } from '@entities/Config/__tests__/Config.fixture';
import { ROUTE_ENDPOINT } from '@entities/Route';
import {
  ROUTE_EXPLANATION_FIXTURE,
  ROUTE_FINAL_FIXTURE,
  ROUTE_UNKNOWN_FIXTURE,
} from '@entities/Route/__tests__/Route.fixture';

import { RouteExplanation } from '../ui/RouteExplanation';

const JSON_INDENT = 2;

/** В конфиге фикстуры 32 правила, а объяснение приходит на 7 — длины разные. */
const CONFIG_TEXT = JSON.stringify(CONFIG_FIXTURE, null, JSON_INDENT);

function serveExplanation(body: typeof ROUTE_EXPLANATION_FIXTURE) {
  server.use(http.get(ROUTE_ENDPOINT.explanation('c-1'), () => HttpResponse.json(body)));
}

function serveConfig(text: string) {
  server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text)));
}

/** Конфиг ровно с тем числом правил, что отдал демон: связка с узлом жива. */
function configWithRules(count: number): string {
  const rules = Array.from({ length: count }, (_, index) => ({ inbound: `in-${String(index)}`, outbound: 'direct' }));

  return JSON.stringify({ route: { rules } }, null, JSON_INDENT);
}

describe('RouteExplanation', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('показывает сработавшее правило и его происхождение', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => <RouteExplanation connectionId='c-1' onClose={vi.fn<() => void>()} />);

    // Индексы демона считаются с нуля, на экране правила нумеруются с единицы.
    expect(await screen.findByText('Сработало правило 7')).toBeInTheDocument();
    expect(screen.getByText('rule_set=google-ip')).toBeInTheDocument();
    expect(screen.getAllByText('от sing-box').length).toBeGreaterThan(0);
  });

  it('ведёт к правилу в редакторе, когда список процесса сходится с конфигом', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => <RouteExplanation connectionId='c-1' onClose={vi.fn<() => void>()} />);

    const link = await screen.findByRole('link', { name: 'Открыть правило в редакторе' });

    expect(link).toHaveAttribute('href', '/config?rule=7');
  });

  it('отключает переход к узлу, когда процесс исполняет другой конфиг', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(CONFIG_TEXT);

    renderWithRouter(() => <RouteExplanation connectionId='c-1' onClose={vi.fn<() => void>()} />);

    expect(await screen.findByText('sing-box работает по другому конфигу')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Открыть правило в редакторе' })).not.toBeInTheDocument();
    // Номер узла чужого документа не показывается вовсе: он указал бы на
    // другое правило (ADR-0007).
    expect(screen.queryByText('Сработало правило 7')).not.toBeInTheDocument();
    expect(screen.getByText('Правило не определено')).toBeInTheDocument();
  });

  it('исход по умолчанию показывает наблюдением, а не неизвестностью', async () => {
    serveExplanation(ROUTE_FINAL_FIXTURE);
    serveConfig(configWithRules(ROUTE_FINAL_FIXTURE.rules.length));

    renderWithRouter(() => <RouteExplanation connectionId='c-1' onClose={vi.fn<() => void>()} />);

    expect(await screen.findByText('Ни одно правило не совпало')).toBeInTheDocument();
    expect(screen.queryByText('неизвестно')).not.toBeInTheDocument();
  });

  it('неизвестное правило показывает причиной, а не догадкой', async () => {
    serveExplanation(ROUTE_UNKNOWN_FIXTURE);
    serveConfig(configWithRules(0));

    renderWithRouter(() => <RouteExplanation connectionId='c-1' onClose={vi.fn<() => void>()} />);

    expect(await screen.findByText('Правило не определено')).toBeInTheDocument();
    // Причина — перевод панели по коду демона, а не его строка: она на его языке.
    expect(screen.getByText('правила этого соединения нет в списке работающего sing-box')).toBeInTheDocument();
    expect(screen.queryByText(ROUTE_UNKNOWN_FIXTURE.match.reason ?? '')).not.toBeInTheDocument();
    expect(screen.getByText('неизвестно')).toBeInTheDocument();
  });

  it('цепочку показывает в порядке чтения человеком', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => <RouteExplanation connectionId='c-1' onClose={vi.fn<() => void>()} />);

    const chain = await screen.findByRole('list', { name: 'Цепочка прокси' });

    expect(chain).toHaveTextContent('alt-fallbackhk-01');
  });
});
