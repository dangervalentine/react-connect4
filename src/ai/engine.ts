import { type Difficulty, type GameBoard, type Player } from '../constants';
import {
  canPlay,
  fromGameBoard,
  isWinningMove,
  opponentView,
  type Position,
} from './bitboard';
import { MATE_SCORE, scoreAllMoves } from './search';

/**
 * Choose a column for the AI to play. Three difficulty profiles:
 *
 *   easy   — heuristic only: always take an immediate win, always block an
 *            immediate loss, otherwise weighted-random with a center bias.
 *            Plays like a casual human who isn't reading ahead. No search.
 *
 *   medium — depth-4 negamax with α-β. Occasionally picks the 2nd-best move
 *            when the gap is small, so it doesn't feel mechanical. Strong
 *            tactical play but blunderable.
 *
 *   hard   — depth-7 negamax with α-β. Plays accurately within its horizon —
 *            spots traps several moves out and rarely walks into one.
 */

const MOVE_ORDER: readonly number[] = [3, 4, 2, 5, 1, 6, 0];

// Per-difficulty search depths. Hard at 7 keeps single-move thinking well
// under a quarter-second even on slow phones, with BigInt eval.
const DEPTH: Record<Difficulty, number> = {
  easy: 0, // unused — easyMove doesn't search
  medium: 4,
  hard: 7,
};

const playableColumns = (pos: Position): number[] => {
  const cols: number[] = [];
  for (const c of MOVE_ORDER) if (canPlay(pos, c)) cols.push(c);
  return cols;
};

// Center-weighted column preference: tighter Gaussian-ish curve.
const COLUMN_WEIGHT = [1, 2, 4, 5, 4, 2, 1] as const;

const weightedRandomColumn = (playable: readonly number[]): number => {
  const total = playable.reduce((s, c) => s + COLUMN_WEIGHT[c], 0);
  let pick = Math.random() * total;
  for (const c of playable) {
    pick -= COLUMN_WEIGHT[c];
    if (pick <= 0) return c;
  }
  return playable[playable.length - 1];
};

const easyMove = (pos: Position): number => {
  // 1. Take any immediate win.
  for (const c of MOVE_ORDER) {
    if (canPlay(pos, c) && isWinningMove(pos, c)) return c;
  }
  // 2. Block any immediate opponent win — check from their perspective.
  const opp = opponentView(pos);
  for (const c of MOVE_ORDER) {
    if (canPlay(opp, c) && isWinningMove(opp, c)) return c;
  }
  // 3. Otherwise weighted-random with center bias.
  const playable = playableColumns(pos);
  return playable.length === 0 ? 3 : weightedRandomColumn(playable);
};

/**
 * Pick a column for the given board state. Pure function — no side effects.
 */
export const chooseMove = (
  board: GameBoard,
  currentPlayer: Player,
  difficulty: Difficulty,
): number => {
  const pos = fromGameBoard(board, currentPlayer);

  if (difficulty === 'easy') return easyMove(pos);

  const scored = scoreAllMoves(pos, DEPTH[difficulty]);
  if (scored.length === 0) return 3; // unreachable — engine only called mid-game

  const best = scored[0];

  if (difficulty === 'medium') {
    // 30% of the time, if the top two moves are within a "soft" gap, pick the
    // second. This produces a player that reads ahead but doesn't always
    // commit to the optimal line — feels like a competent casual opponent.
    // Forced wins are never sandbagged: if the best move is a mate, take it.
    if (
      scored.length >= 2 &&
      Math.abs(best.score) < MATE_SCORE - 100 &&
      Math.abs(best.score - scored[1].score) < 25 &&
      Math.random() < 0.3
    ) {
      return scored[1].col;
    }
    return best.col;
  }

  // hard: best move, no sandbagging
  return best.col;
};
