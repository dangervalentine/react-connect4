import { COLUMNS, ROWS } from '../constants';
import { canPlay, isWinningMove, play, type Position } from './bitboard';
import { evaluatePosition } from './eval';

/**
 * Negamax search with α-β pruning. Returns a score from the current mover's
 * perspective. A larger score is better for the player to move.
 *
 * We score wins as `MAX_SCORE - ply` so that a win in fewer moves is preferred
 * to a win in more moves (and conversely we prefer losses farther away). The
 * scoreAllMoves wrapper drives a top-level move loop and collects per-move
 * scores so the engine can sample from near-best moves at medium difficulty.
 */

const MAX_MOVES = COLUMNS * ROWS; // 42

// A score that comfortably exceeds the maximum the heuristic can produce, so
// terminal wins always beat any heuristic value.
export const MATE_SCORE = 100000;

// Center-out move ordering: in Connect 4 the center column is by far the most
// valuable, then adjacent columns. Trying it first dramatically improves the
// number of α-β cutoffs.
const MOVE_ORDER: readonly number[] = [3, 4, 2, 5, 1, 6, 0];

const negamax = (
  pos: Position,
  depth: number,
  alphaIn: number,
  beta: number,
): number => {
  // Draw: every cell filled with no win.
  if (pos.moves === MAX_MOVES) return 0;

  // If any legal move wins immediately, take it — short-circuits the recursion
  // and yields a "win-soon" score.
  for (const col of MOVE_ORDER) {
    if (canPlay(pos, col) && isWinningMove(pos, col)) {
      return MATE_SCORE - pos.moves - 1;
    }
  }

  if (depth === 0) return evaluatePosition(pos);

  let alpha = alphaIn;
  let best = -MATE_SCORE * 2;
  for (const col of MOVE_ORDER) {
    if (!canPlay(pos, col)) continue;
    const child = play(pos, col);
    const score = -negamax(child, depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // α-β cutoff
  }
  return best;
};

export type ScoredMove = { col: number; score: number };

/**
 * Score every legal move from the given position. Returned sorted best-first.
 * Used by the engine to pick the top move (or near-top, on medium difficulty).
 */
export const scoreAllMoves = (pos: Position, depth: number): ScoredMove[] => {
  const scores: ScoredMove[] = [];

  for (const col of MOVE_ORDER) {
    if (!canPlay(pos, col)) continue;

    // Immediate-win shortcut at the root, same idea as inside negamax.
    if (isWinningMove(pos, col)) {
      scores.push({ col, score: MATE_SCORE - pos.moves - 1 });
      continue;
    }

    const child = play(pos, col);
    const score = -negamax(child, depth - 1, -MATE_SCORE * 2, MATE_SCORE * 2);
    scores.push({ col, score });
  }

  return scores.sort((a, b) => b.score - a.score);
};
