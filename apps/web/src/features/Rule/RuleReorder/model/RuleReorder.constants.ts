/** Куда сдвигается правило: на одну позицию вверх или вниз по списку. */
export const MOVE = {
  Up: -1,
  Down: 1,
} as const;

export type Move = (typeof MOVE)[keyof typeof MOVE];
