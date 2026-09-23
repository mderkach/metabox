import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionRow as ConnectionRowModel } from '@entities/Connection';
import { cn } from '@shared/lib/utils';

import { CELL } from './ConnectionCells';
import { CONNECTION_FIELD, type ConnectionCell, type ConnectionField } from './ConnectionColumns';
import { ConnectionRowActions } from './ConnectionRowActions';

const CARD_PLACE = {
  Title: 'title',
  Route: 'route',
  Chain: 'chain',
  Origin: 'origin',
  Traffic: 'traffic',
} as const;

type CardPlace = (typeof CARD_PLACE)[keyof typeof CARD_PLACE];

/**
 * Место поля в карточке. Запись обязательна для каждого поля: колонка без
 * места в карточке не соберётся, а не пропадёт с узкого экрана молча.
 */
const FIELD_PLACE: Readonly<Record<ConnectionField, CardPlace>> = {
  [CONNECTION_FIELD.Source]: CARD_PLACE.Origin,
  [CONNECTION_FIELD.Host]: CARD_PLACE.Title,
  [CONNECTION_FIELD.Network]: CARD_PLACE.Origin,
  [CONNECTION_FIELD.Rule]: CARD_PLACE.Route,
  [CONNECTION_FIELD.Action]: CARD_PLACE.Route,
  [CONNECTION_FIELD.Chain]: CARD_PLACE.Chain,
  [CONNECTION_FIELD.Rate]: CARD_PLACE.Traffic,
  [CONNECTION_FIELD.Volume]: CARD_PLACE.Traffic,
  [CONNECTION_FIELD.Age]: CARD_PLACE.Origin,
};

/** Строки под заголовком сверху вниз и знак между значениями одной строки. */
const CARD_LINES: readonly { place: CardPlace; separator: string }[] = [
  { place: CARD_PLACE.Route, separator: '→' },
  { place: CARD_PLACE.Chain, separator: '' },
  { place: CARD_PLACE.Origin, separator: '·' },
];

interface CardLine {
  place: CardPlace;
  separator: string;
  cells: readonly ConnectionCell[];
}

function toCardLines(cells: readonly ConnectionCell[]): { lines: CardLine[]; traffic: ConnectionCell[] } {
  const lines = CARD_LINES.map((line) => ({
    ...line,
    cells: cells.filter(({ id }) => FIELD_PLACE[id] === line.place),
  }));

  return {
    lines: lines.filter((line) => line.cells.length > 0),
    traffic: cells.filter(({ id }) => FIELD_PLACE[id] === CARD_PLACE.Traffic),
  };
}

/**
 * Соединение карточкой узкого экрана.
 *
 * В таблице на телефоне видно середину строк, и к какому соединению они
 * относятся, определить нечем. Карточка называется хостом назначения — по нему
 * соединение узнают, — и хост рисуется заголовком, а не строкой списка: колонка
 * обязательна и скрыта быть не может. Объём и скорость стоят столбцом справа от
 * строк, а не строкой под ними: их ячейки двухэтажные (↓ над ↑), и отдельной
 * строкой они добавили бы карточке две. Подписи полей видит только скринридер:
 * на узком экране высота дороже, а значения узнаются по виду.
 *
 * Значения рисуют те же ячейки, что и таблица: расхождение форматирования между
 * раскладками читалось бы как расхождение данных.
 */
function ConnectionCardProto({
  connection,
  cells,
  now,
  onClose,
  onExplain,
  selected,
  panelId,
}: {
  connection: ConnectionRowModel;
  cells: readonly ConnectionCell[];
  /** Момент отсчёта времени. Снаружи, иначе карточка врала бы про свежесть. */
  now: number;
  onClose: ((id: string) => void) | null;
  onExplain: ((id: string) => void) | null;
  selected: boolean;
  panelId?: string;
}) {
  const { t } = useTranslation('widgets/ConnectionTable');
  const { lines, traffic } = useMemo(() => toCardLines(cells), [cells]);

  return (
    <div
      role='listitem'
      className={cn(
        'relative flex flex-col gap-1.5 border-b border-border px-4 py-2.5',
        selected && 'bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-selected-edge'
      )}
    >
      <div className='flex min-w-0 items-center gap-2'>
        <dl className='min-w-0 grow'>
          <div>
            <dt className='sr-only'>{t('column.host')}</dt>
            <dd className='truncate font-mono text-sm font-medium' title={connection.host}>
              {connection.host}
            </dd>
          </div>
        </dl>
        <div className='flex shrink-0 items-center gap-1'>
          <ConnectionRowActions
            connection={connection}
            onClose={onClose}
            onExplain={onExplain}
            selected={selected}
            panelId={panelId}
          />
        </div>
      </div>

      <div className='flex min-w-0 gap-3'>
        <div className='flex min-w-0 grow flex-col gap-1'>
          {lines.map(({ place, separator, cells: lineCells }) => (
            <dl key={place} className='flex min-w-0 items-baseline gap-1.5'>
              {lineCells.map(({ id, label }, index) => {
                const Cell = CELL[id];

                return (
                  <div key={id} className='flex min-w-0 items-baseline'>
                    <dt className='sr-only'>{t(label)}</dt>
                    <dd className='flex min-w-0 items-baseline gap-1.5'>
                      {index > 0 && (
                        <span aria-hidden className='text-xs text-muted-foreground'>
                          {separator}
                        </span>
                      )}
                      <Cell connection={connection} now={now} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          ))}
        </div>

        {traffic.length > 0 && (
          <dl className='flex shrink-0 gap-3 text-right'>
            {traffic.map(({ id, label }) => {
              const Cell = CELL[id];

              return (
                <div key={id}>
                  <dt className='sr-only'>{t(label)}</dt>
                  <dd>
                    <Cell connection={connection} now={now} />
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </div>
  );
}

export const ConnectionCard = memo(ConnectionCardProto);
