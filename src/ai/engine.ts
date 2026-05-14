import { COLUMNS, ROWS, type Difficulty, type GameBoard, type Player } from '../constants';
import {
  canPlay,
  fromGameBoard,
  isWinningMove,
  opponentView,
  type Position,
} from './bitboard';
import { MATE_SCORE, scoreAllMoves, type SearchOptions } from './search';

/**
 * Choose a column for the AI to play. Three difficulty profiles:
 *
 *   easy   — heuristic only: always take an immediate win, always block an
 *            immediate loss, otherwise weighted-random with a center bias.
 *            Plays like a casual human who isn't reading ahead. No search.
 *
 *   medium — iterative-deepening negamax with α-β + TT, capped at depth 7 with
 *            a ~800ms wall-clock budget. Occasionally picks the 2nd-best move
 *            when the score gap is tiny, so it doesn't feel mechanical. Strong
 *            tactical play but blunderable on long-range traps.
 *
 *   hard   — same engine, uncapped depth (up to MAX_MOVES) with a ~2500ms
 *            budget. Within the budget it iteratively deepens; late-game
 *            positions are fully solved (search depth = remaining cells). The
 *            heuristic understands Connect 4's parity / zugzwang principle, so
 *            even mid-game decisions are made with the right long-range
 *            objective in mind.
 */

const MOVE_ORDER: readonly number[] = [3, 4, 2, 5, 1, 6, 0];

// Total cells on the board — used as an unbounded depth cap for hard mode.
// Once iterative deepening reaches movesRemaining = MAX_MOVES - pos.moves, the
// search is exhaustive and the result is the true game-theoretic value.
const MAX_MOVES = COLUMNS * ROWS;

const SEARCH_OPTIONS: Record<Exclude<Difficulty, 'easy'>, SearchOptions> = {
  // Medium intentionally caps depth: we want a recognizable tactical level,
  // not a "strong solver with a slow timer". The budget is a safety net for
  // dense midgame positions.
  medium: { maxDepth: 7, budgetMs: 800 },
  // Hard is "solve when feasible". MAX_MOVES disables the depth cap; the
  // 2500ms budget keeps single-turn freezes bounded on slower devices. Late-
  // game positions (movesRemaining small) finish well under budget and return
  // perfect play; early-game positions return the deepest completed depth.
  hard: { maxDepth: MAX_MOVES, budgetMs: 2500 },
};

// Medium's "soft" preference window: when the top two moves are within this
// many points AND the score isn't anywhere near a mate, medium has a chance
// to take the 2nd-best move. Tightened from the previous (depth-4-era) value
// of 25 because deeper search produces a finer-grained score distribution —
// 25 used to mean "essentially identical moves", now it's "noticeably worse".
const MEDIUM_SOFT_WINDOW = 8;
const MEDIUM_SANDBAG_PROB = 0.18;

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

  const scored = scoreAllMoves(pos, SEARCH_OPTIONS[difficulty]);
  // scoreAllMoves always returns at least one move when called mid-game.
  // The "no playable column" case (board full) is handled by the caller in
  // App.tsx — we'd never get here. Belt-and-suspenders: column 3.
  if (scored.length === 0) return 3;

  const best = scored[0];

  if (difficulty === 'medium') {
    // Slight sandbagging: when the top two moves are tactically equivalent
    // (gap below MEDIUM_SOFT_WINDOW) and neither is a forced mate, pick the
    // 2nd-best with low probability. This adds a touch of unpredictability
    // without throwing actually-better moves overboard. Forced wins/losses
    // are always played straight.
    if (
      scored.length >= 2 &&
      Math.abs(best.score) < MATE_SCORE - ROWS * COLUMNS &&
      Math.abs(best.score - scored[1].score) < MEDIUM_SOFT_WINDOW &&
      Math.random() < MEDIUM_SANDBAG_PROB
    ) {
      return scored[1].col;
    }
    return best.col;
  }

  // hard: best move, no sandbagging.
  return best.col;
};
