/** Where a rule moves: one position up or down the list. */
export const MOVE = {
  Up: -1,
  Down: 1,
} as const;

export type Move = (typeof MOVE)[keyof typeof MOVE];
