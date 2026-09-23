import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import { RouteExplanation, RouteExplanationSheet } from '../ui/RouteExplanation';

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

    renderWithRouter(() => (
      <RouteExplanation connectionId='c-1' host='video.example:443' onClose={vi.fn<() => void>()} />
    ));

    // Индексы демона считаются с нуля, на экране правила нумеруются с единицы.
    expect(await screen.findByText('Сработало правило 7')).toBeInTheDocument();
    expect(screen.getByText('rule_set=google-ip')).toBeInTheDocument();
    expect(screen.getAllByText('от sing-box').length).toBeGreaterThan(0);
  });

  it('ведёт к правилу в редакторе, когда список процесса сходится с конфигом', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation connectionId='c-1' host='video.example:443' onClose={vi.fn<() => void>()} />
    ));

    const link = await screen.findByRole('link', { name: 'Открыть правило в редакторе' });

    expect(link).toHaveAttribute('href', '/config?rule=7');
    // Классы варианта прогоняются через `cn`: иначе `border-transparent` базы
    // доживает рядом с `border-border` варианта, и ссылка остаётся без рамки.
    expect(link).toHaveClass('border-border');
    expect(link).not.toHaveClass('border-transparent');
  });

  it('отключает переход к узлу, когда процесс исполняет другой конфиг', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(CONFIG_TEXT);

    renderWithRouter(() => (
      <RouteExplanation connectionId='c-1' host='video.example:443' onClose={vi.fn<() => void>()} />
    ));

    expect(await screen.findByText('sing-box работает по другому конфигу')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Открыть правило в редакторе' })).not.toBeInTheDocument();
    // Номер узла чужого документа не показывается вовсе: он указал бы на
    // другое правило (ADR-0007).
    expect(screen.queryByText('Сработало правило 7')).not.toBeInTheDocument();
    expect(screen.getByText('Правило не определено')).toBeInTheDocument();
  });

  it('выход по умолчанию показывает наблюдением, а не неизвестностью', async () => {
    serveExplanation(ROUTE_FINAL_FIXTURE);
    serveConfig(configWithRules(ROUTE_FINAL_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation connectionId='c-1' host='video.example:443' onClose={vi.fn<() => void>()} />
    ));

    expect(await screen.findByText('Ни одно правило не совпало')).toBeInTheDocument();
    expect(screen.queryByText('неизвестно')).not.toBeInTheDocument();
  });

  it('неизвестное правило показывает причиной, а не догадкой', async () => {
    serveExplanation(ROUTE_UNKNOWN_FIXTURE);
    serveConfig(configWithRules(0));

    renderWithRouter(() => (
      <RouteExplanation connectionId='c-1' host='video.example:443' onClose={vi.fn<() => void>()} />
    ));

    expect(await screen.findByText('Правило не определено')).toBeInTheDocument();
    // Причина — перевод панели по коду демона, а не его строка: она на его языке.
    expect(screen.getByText('правила этого соединения нет в списке работающего sing-box')).toBeInTheDocument();
    expect(screen.queryByText(ROUTE_UNKNOWN_FIXTURE.match.reason ?? '')).not.toBeInTheDocument();
    expect(screen.getByText('неизвестно')).toBeInTheDocument();
  });

  it('цепочку показывает в порядке чтения человеком', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation connectionId='c-1' host='video.example:443' onClose={vi.fn<() => void>()} />
    ));

    const chain = await screen.findByRole('list', { name: 'Цепочка прокси' });

    expect(chain).toHaveTextContent('alt-fallbackhk-01');
  });

  it('называется соединением, о котором рассказывает', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation connectionId='c-1' host='video.example:443' onClose={vi.fn<() => void>()} />
    ));

    expect(
      await screen.findByRole('complementary', { name: 'Маршрут соединения video.example:443' })
    ).toBeInTheDocument();
  });

  it('закрывается по Escape', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();

    renderWithRouter(() => <RouteExplanation connectionId='c-1' host='video.example:443' onClose={onClose} />);

    await screen.findByRole('complementary');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RouteExplanationSheet', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));
  });

  it('открыта, пока выбрано соединение, и называется им', async () => {
    renderWithRouter(() => (
      <RouteExplanationSheet connectionId='c-1' host='video.example:443' onClose={vi.fn<() => void>()} />
    ));

    const sheet = await screen.findByRole('dialog', { name: 'Маршрут соединения video.example:443' });

    expect(await within(sheet).findByText('Сработало правило 7')).toBeInTheDocument();
  });

  it('без выбранного соединения закрыта', () => {
    renderWithRouter(() => <RouteExplanationSheet connectionId={null} host='' onClose={vi.fn<() => void>()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('закрывается по Escape и кнопкой закрытия', async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();

    renderWithRouter(() => <RouteExplanationSheet connectionId='c-1' host='video.example:443' onClose={onClose} />);

    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Закрыть объяснение' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
