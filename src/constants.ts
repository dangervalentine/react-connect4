// Board dimensions. Lifted out of the helpers/store so changes propagate cleanly.
export const COLUMNS = 7;
export const ROWS = 6;
export const WIN_LENGTH = 4;

// 0 = empty, 1 = player 1, 2 = player 2.
export type Cell = 0 | 1 | 2;
export type Player = 1 | 2;
export type GameBoard = Cell[][];

export type WinningPiece = { column: number; row: number };
