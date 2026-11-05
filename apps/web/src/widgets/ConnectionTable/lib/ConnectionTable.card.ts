import { CONNECTION_FIELD, type ConnectionCell, type ConnectionField } from '../ui/ConnectionColumns';

const CARD_PLACE = {
  Title: 'title',
  Route: 'route',
  Chain: 'chain',
  Origin: 'origin',
  Traffic: 'traffic',
} as const;

type CardPlace = (typeof CARD_PLACE)[keyof typeof CARD_PLACE];

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

export function toCardLines(cells: readonly ConnectionCell[]): { lines: CardLine[]; traffic: ConnectionCell[] } {
  const lines = CARD_LINES.map((line) => ({
    ...line,
    cells: cells.filter(({ id }) => FIELD_PLACE[id] === line.place),
  }));

  return {
    lines: lines.filter((line) => line.cells.length > 0),
    traffic: cells.filter(({ id }) => FIELD_PLACE[id] === CARD_PLACE.Traffic),
  };
}
