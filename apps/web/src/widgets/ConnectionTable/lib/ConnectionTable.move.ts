export const MOVE = {
  Up: -1,
  Down: 1,
} as const;

export type Move = (typeof MOVE)[keyof typeof MOVE];

export function toMoveButtonId(field: string, move: Move): string {
  return `connection-field-${field}-${move === MOVE.Up ? 'up' : 'down'}`;
}
