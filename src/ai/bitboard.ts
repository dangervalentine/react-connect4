import { COLUMNS, ROWS, type GameBoard, type Player } from '../constants';

/**
 * Bitboard representation of a Connect 4 position. Each column gets H = ROWS+1
 * bits, the top bit being a sentinel so that "add 1 to the bottom of column c"
 * via integer addition lands cleanly inside the column. With ROWS=6, that's
 * 7 bits/col × 7 cols = 49 bits total — beyond JS's 32-bit bitwise range, so
 * we use BigInt throughout.
 *
 * Encoding (matches Pascal Pons' canonical scheme):
 *   - `mask`     bit set for every occupied cell, regardless of player.
 *   - `position` bit set for cells owned by the player whose turn it is to move.
 *
 * Within a column, bit (c*H + 0) is the BOTTOM cell, bit (c*H + ROWS-1) is the
 * top playable cell, and bit (c*H + ROWS) is the sentinel.
 */

const H = ROWS + 1; // 7 — bits per column including the sentinel row.
const H_BIG = BigInt(H);

const bottomBit = (col: number): bigint => 1n << BigInt(col * H);
const topPlayableBit = (col: number): bigint =>
  1n << BigInt(col * H + (ROWS - 1));
const columnPlayableMask = (col: number): bigint =>
  ((1n << BigInt(ROWS)) - 1n) << BigInt(col * H);

/** Bit at (col, gameBoardRow). gameBoardRow=0 is the top of the column. */
export const bitAt = (col: number, gameBoardRow: number): bigint =>
  1n << BigInt(col * H + (ROWS - 1 - gameBoardRow));

const BOARD_PLAYABLE_MASK: bigint = (() => {
  let m = 0n;
  for (let c = 0; c < COLUMNS; c++) m |= columnPlayableMask(c);
  return m;
})();

export type Position = {
  /** Bits set for the player who is to move next. */
  position: bigint;
  /** Bits set for every occupied cell. */
  mask: bigint;
  /** Plies played so far (0..42). */
  moves: number;
};

export const emptyPosition = (): Position => ({
  position: 0n,
  mask: 0n,
  moves: 0,
});

/** True iff column has at least one empty playable cell. */
export const canPlay = (pos: Position, col: number): boolean =>
  (pos.mask & topPlayableBit(col)) === 0n;

/**
 * Play `col`. Returns a new Position with player perspective swapped — i.e.
 * `position` afterwards represents the pieces of the player whose turn is
 * now next. Caller must check `canPlay(pos, col)` first.
 *
 * Order matters: we XOR `position` with the OLD mask first (which converts
 * "current mover's pieces" into "opponent's pieces" = new mover's pieces),
 * then update the mask to include the just-played piece. Doing it the other
 * way around — XORing with the new mask — would fold the just-played piece
 * (which belongs to the old mover, not the new mover) into `position`, and
 * silently corrupt every subsequent eval and search.
 */
export const play = (pos: Position, col: number): Position => {
  // Step 1: swap perspective. Before any new piece is placed, the new mover's
  // pieces are exactly the old opponent's pieces = pos.mask XOR pos.position.
  const swappedPosition = pos.position ^ pos.mask;
  // Step 2: drop the piece. `mask + bottomBit(col)` carries up to the lowest
  // empty slot in the column; ORing into mask seats the new piece there. The
  // piece belongs to the old mover (now the new opponent), so it's correctly
  // absent from `swappedPosition`.
  const newMask = pos.mask | (pos.mask + bottomBit(col));
  return {
    position: swappedPosition,
    mask: newMask,
    moves: pos.moves + 1,
  };
};

/** True iff `p` contains four consecutive bits in any of the four directions. */
export const hasFourInARow = (p: bigint): boolean => {
  // Vertical: shift by 1 bit (next row up within the same column).
  let m = p & (p >> 1n);
  if ((m & (m >> 2n)) !== 0n) return true;
  // Horizontal: shift by H (same row, next column right).
  m = p & (p >> H_BIG);
  if ((m & (m >> (H_BIG * 2n))) !== 0n) return true;
  // Diagonal /: shift by H-1 (up-right).
  m = p & (p >> (H_BIG - 1n));
  if ((m & (m >> ((H_BIG - 1n) * 2n))) !== 0n) return true;
  // Diagonal \: shift by H+1 (down-right).
  m = p & (p >> (H_BIG + 1n));
  if ((m & (m >> ((H_BIG + 1n) * 2n))) !== 0n) return true;
  return false;
};

/**
 * True iff playing `col` would complete four in a row for the current player.
 * Caller should still check canPlay first if they need to handle full columns.
 */
export const isWinningMove = (pos: Position, col: number): boolean => {
  if (!canPlay(pos, col)) return false;
  const newPieceBit = (pos.mask + bottomBit(col)) & columnPlayableMask(col);
  return hasFourInARow(pos.position | newPieceBit);
};

/** Convert from GameBoard (col-major, row 0 = top) to a bitboard Position. */
export const fromGameBoard = (
  board: GameBoard,
  currentPlayer: Player,
): Position => {
  let position = 0n;
  let mask = 0n;
  let moves = 0;
  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const v = board[col][row];
      if (v === 0) continue;
      moves++;
      const bit = bitAt(col, row);
      mask |= bit;
      if (v === currentPlayer) position |= bit;
    }
  }
  return { position, mask, moves };
};

/** Returns the perspective-swapped position — i.e. what the opponent sees. */
export const opponentView = (pos: Position): Position => ({
  position: pos.position ^ pos.mask,
  mask: pos.mask,
  moves: pos.moves,
});

/** All playable cells across the whole board. Useful for caller convenience. */
export const allPlayableCells = (): bigint => BOARD_PLAYABLE_MASK;
