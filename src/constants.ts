// Board dimensions. Lifted out of the helpers/store so changes propagate cleanly.
export const COLUMNS = 7;
export const ROWS = 6;
export const WIN_LENGTH = 4;

// 0 = empty, 1 = player 1, 2 = player 2.
export type Cell = 0 | 1 | 2;
export type Player = 1 | 2;
export type GameBoard = Cell[][];

export type WinningPiece = { column: number; row: number };

// ─────────────── setup / configuration types ───────────────

export type GamePhase = 'setup' | 'playing' | 'finished';
export type GameMode = 'pvp' | 'pve';
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Display color choice. Red is always Player 1 (moves first); Black is always
 * Player 2 (moves second). So picking a color also picks turn order.
 */
export type PieceColor = 'red' | 'black';

export const playerForColor = (color: PieceColor): Player =>
  color === 'red' ? 1 : 2;

export type GameConfig = {
  mode: GameMode;
  /** Only meaningful when mode === 'pve'. */
  difficulty: Difficulty;
  /** Which color the human plays (PvE) or which color goes first (PvP — always red). */
  humanColor: PieceColor;
  timersEnabled: boolean;
};
