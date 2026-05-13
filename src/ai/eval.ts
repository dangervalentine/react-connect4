import { COLUMNS, ROWS, WIN_LENGTH } from '../constants';
import { bitAt, type Position } from './bitboard';

/**
 * Heuristic evaluation for non-terminal nodes. Returns a score in the current
 * mover's perspective: positive = better for the player whose turn it is.
 *
 * Approach: enumerate all 69 possible 4-in-a-row line positions on the board,
 * and for each, count how many cells each side already owns. A line with one
 * side's pieces and no opposing pieces is a "potential threat" weighted by how
 * close it is to completing. Plus a small center-column bonus.
 */

const LINE_MASKS: bigint[] = (() => {
  const lines: bigint[] = [];
  const dirs: ReadonlyArray<readonly [number, number]> = [
    [1, 0],  // horizontal
    [0, 1],  // vertical (gameBoard rows go down)
    [1, 1],  // diagonal down-right
    [1, -1], // diagonal up-right
  ];
  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      for (const [dc, dr] of dirs) {
        const endCol = col + dc * (WIN_LENGTH - 1);
        const endRow = row + dr * (WIN_LENGTH - 1);
        if (endCol < 0 || endCol >= COLUMNS) continue;
        if (endRow < 0 || endRow >= ROWS) continue;
        let m = 0n;
        for (let i = 0; i < WIN_LENGTH; i++) {
          m |= bitAt(col + dc * i, row + dr * i);
        }
        lines.push(m);
      }
    }
  }
  return lines;
})();

// Bitmask covering the center column (col 3) — central control is worth a bit.
const CENTER_MASK: bigint = (() => {
  let m = 0n;
  for (let r = 0; r < ROWS; r++) m |= bitAt(3, r);
  return m;
})();

// 0..4 pieces in line → score weight. The jump from 2→3 is large on purpose;
// a 3-in-a-row with one open end is one move from victory.
const PIECE_COUNT_WEIGHT = [0, 1, 10, 50, 0] as const;

/** Count bits in a BigInt that's known to have at most a few set. */
const popcountSmall = (b: bigint): number => {
  let n = 0;
  let x = b;
  while (x !== 0n) {
    x &= x - 1n; // Brian Kernighan trick: clear lowest set bit.
    n++;
  }
  return n;
};

export const evaluatePosition = (pos: Position): number => {
  const me = pos.position;
  const them = pos.mask ^ pos.position;

  let score = 0;
  for (const line of LINE_MASKS) {
    const mineInLine = line & me;
    const theirsInLine = line & them;
    if (mineInLine !== 0n && theirsInLine !== 0n) continue; // blocked, no value
    if (mineInLine !== 0n) {
      score += PIECE_COUNT_WEIGHT[popcountSmall(mineInLine)];
    } else if (theirsInLine !== 0n) {
      score -= PIECE_COUNT_WEIGHT[popcountSmall(theirsInLine)];
    }
  }

  score += 4 * popcountSmall(me & CENTER_MASK);
  score -= 4 * popcountSmall(them & CENTER_MASK);

  return score;
};
