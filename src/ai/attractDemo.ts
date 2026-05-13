import { COLUMNS, ROWS, type GameBoard, type Player, type WinningPiece } from '../constants';
import { checkGameBoard, isBoardFull } from '../helpers';
import { cellKey, createAnimState, type AnimState } from '../canvas/animations';
import { chooseMove } from './engine';

/**
 * Self-playing "attract" demo that runs behind the welcome modal. Two easy-
 * difficulty bots take turns until someone wins or the board fills, then we
 * pause for a beat (so the winning-piece pulse plays) and start over.
 *
 * Kept entirely outside the Zustand store so the real game state is never
 * touched. The store's `gameBoard` stays empty until `startGame` runs.
 */

const createEmptyBoard = (): GameBoard =>
  Array.from({ length: COLUMNS }, () => Array<0 | 1 | 2>(ROWS).fill(0));

/** Top-most empty row in a column, or -1 if full. */
const firstFreeRow = (column: ReadonlyArray<number>): number => {
  const firstNonZero = column.findIndex((v) => v !== 0);
  if (firstNonZero === -1) return ROWS - 1;
  return firstNonZero - 1;
};

export type AttractState = {
  gameBoard: GameBoard;
  currentPlayer: Player;
  winningPieces: WinningPiece[];
  /** True once a side has won or the board is full. */
  isOver: boolean;
  /** Animation state for piece-drop and win-pulse rendering. */
  anim: AnimState;
  /** performance.now() at which the current attract game ended. */
  endedAt: number | null;
};

export const createAttract = (): AttractState => ({
  gameBoard: createEmptyBoard(),
  currentPlayer: 1,
  winningPieces: [],
  isOver: false,
  anim: createAnimState(),
  endedAt: null,
});

/** Clear back to an empty board so the next attract game can begin. */
export const resetAttract = (a: AttractState): void => {
  a.gameBoard = createEmptyBoard();
  a.currentPlayer = 1;
  a.winningPieces = [];
  a.isOver = false;
  a.endedAt = null;
  a.anim.drops.clear();
};

/**
 * How long to hold the final position after a win/draw before resetting. Lets
 * the winning-piece pulse animation play out so it feels like a satisfying
 * end, not just an instant cut.
 */
const PAUSE_AFTER_OVER_MS = 2400;

/**
 * Advance the attract demo by one move. Caller invokes this on an interval;
 * the function self-throttles around the end-of-game pause.
 */
export const stepAttract = (a: AttractState, now: number): void => {
  if (a.isOver) {
    if (a.endedAt !== null && now - a.endedAt >= PAUSE_AFTER_OVER_MS) {
      resetAttract(a);
    }
    return;
  }

  const col = chooseMove(a.gameBoard, a.currentPlayer, 'easy');
  const row = firstFreeRow(a.gameBoard[col]);
  if (row < 0) {
    // Defensive — easy mode shouldn't return a full column, but bail safely.
    a.isOver = true;
    a.endedAt = now;
    return;
  }

  // Per-column immutable update so accidental aliasing can't corrupt earlier
  // state if anything tries to inspect the board mid-step.
  const newColumn = a.gameBoard[col].slice();
  newColumn[row] = a.currentPlayer;
  a.gameBoard = a.gameBoard.map((c, i) => (i === col ? newColumn : c));
  a.anim.drops.set(cellKey(col, row), now);

  const win = checkGameBoard(a.gameBoard);
  if (win) {
    a.winningPieces = win;
    a.isOver = true;
    a.endedAt = now;
    return;
  }
  if (isBoardFull(a.gameBoard)) {
    a.isOver = true;
    a.endedAt = now;
    return;
  }

  a.currentPlayer = a.currentPlayer === 1 ? 2 : 1;
};
