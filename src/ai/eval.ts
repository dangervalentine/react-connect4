import { COLUMNS, ROWS, WIN_LENGTH } from '../constants';
import { bitAt, type Position } from './bitboard';

/**
 * Heuristic evaluation for non-terminal leaf nodes. Returns a score from the
 * current mover's perspective: positive = better for whoever is to move.
 *
 * Three layers, summed:
 *
 *   1. Line density. Each of the 69 possible 4-in-a-row line positions is
 *      classified by which side(s) already own cells in it. A line with one
 *      side's pieces and no opposing pieces is a "potential threat" weighted
 *      by how close it is to completing.
 *
 *   2. Center column bonus. Cells in the center column appear in more lines
 *      than any other column, so they're worth a small explicit nudge so the
 *      engine values them correctly at shallow depths.
 *
 *   3. Parity-aware threat scoring. For each line where one side has exactly
 *      three of the four cells and the fourth is empty, the empty completion
 *      square is a "threat". Threats are weighted heavily, with an extra
 *      bonus when the threat sits on a row whose bottom-up parity favors
 *      the threat owner — the canonical Connect 4 zugzwang principle:
 *      first player (red) wants threats on odd rows from the bottom (1, 3, 5),
 *      second player (black) wants threats on even rows (2, 4, 6). Stacked
 *      threats in the same column are scored cumulatively; double-threats are
 *      effectively unblockable and the engine should learn to chase them.
 *
 * All scores stay well below MATE_SCORE - MAX_MOVES so a proven mate always
 * dominates the heuristic.
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

/**
 * Per-row parity bonus for the *first* player's threats. Indexed by top-down
 * row (0 = top, 5 = bottom). A first-mover threat on a bottom-up odd row
 * (top-down 5, 3, 1) is favored; even rows are unfavored.
 *
 * The second player's bonus uses the inverse table. The conversion
 * "first-mover-threat-row → second-mover-threat-row" is the same table read
 * with the parity flipped, which is what BOTTOM_UP_PARITY computes.
 */
// Bottom-up row index (1..6) for each top-down row (0..5). Top-down 0 = top,
// which is bottom-up ROWS = 6; top-down 5 = bottom, which is bottom-up 1.
const BOTTOM_UP_ROW: readonly number[] = (() => {
  const arr: number[] = [];
  for (let row = 0; row < ROWS; row++) arr.push(ROWS - row);
  return arr;
})();

// Bitmasks of all cells whose bottom-up row is odd (favored for first player)
// and even (favored for second player). Used to score threat squares in a
// single bitwise op rather than iterating cells.
const ODD_ROW_MASK: bigint = (() => {
  let m = 0n;
  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (BOTTOM_UP_ROW[row] % 2 === 1) m |= bitAt(col, row);
    }
  }
  return m;
})();
const EVEN_ROW_MASK: bigint = (() => {
  let m = 0n;
  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (BOTTOM_UP_ROW[row] % 2 === 0) m |= bitAt(col, row);
    }
  }
  return m;
})();

// 0..4 pieces in line → score weight. The jump from 2→3 is large on purpose;
// a 3-in-a-row with one open end is one move from victory.
const PIECE_COUNT_WEIGHT = [0, 1, 10, 50, 0] as const;

// Bonus added to a threat (3-of-4 line, 1 empty) sitting on the threat owner's
// favored row parity. Layered ON TOP of the existing 50-point line-density
// weight, so a favored-parity threat is worth 50 + THREAT_PARITY_BONUS.
const THREAT_PARITY_BONUS = 30;
// Smaller bonus when the threat is on the *wrong* parity — it's still a
// threat, just less reliable. Keeps the engine from undervaluing immediate
// tactical pressure in service of long-range parity dreams.
const THREAT_OFF_PARITY_BONUS = 6;

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
  const empty = ~pos.mask; // includes off-board bits, but we always AND with line masks before consuming

  // Whose move parity matches "first player overall"? At move 0 the first
  // player is to move (pos.moves === 0, even). So even pos.moves → I am the
  // first player; odd → I am the second.
  const meIsFirst = (pos.moves & 1) === 0;
  const myFavoredRows = meIsFirst ? ODD_ROW_MASK : EVEN_ROW_MASK;
  const themFavoredRows = meIsFirst ? EVEN_ROW_MASK : ODD_ROW_MASK;

  let score = 0;
  for (const line of LINE_MASKS) {
    const mineInLine = line & me;
    const theirsInLine = line & them;
    if (mineInLine !== 0n && theirsInLine !== 0n) continue; // blocked — no value to either side

    if (mineInLine !== 0n) {
      const cnt = popcountSmall(mineInLine);
      score += PIECE_COUNT_WEIGHT[cnt];
      // Parity overlay for a real threat (3 of 4, 1 empty). The empty cell is
      // exactly `line & empty`; classify by which parity-row mask it falls in.
      if (cnt === 3) {
        const threatSquare = line & empty;
        score +=
          (threatSquare & myFavoredRows) !== 0n
            ? THREAT_PARITY_BONUS
            : THREAT_OFF_PARITY_BONUS;
      }
    } else if (theirsInLine !== 0n) {
      const cnt = popcountSmall(theirsInLine);
      score -= PIECE_COUNT_WEIGHT[cnt];
      if (cnt === 3) {
        const threatSquare = line & empty;
        score -=
          (threatSquare & themFavoredRows) !== 0n
            ? THREAT_PARITY_BONUS
            : THREAT_OFF_PARITY_BONUS;
      }
    }
  }

  score += 4 * popcountSmall(me & CENTER_MASK);
  score -= 4 * popcountSmall(them & CENTER_MASK);

  return score;
};
