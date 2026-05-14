import { COLUMNS, ROWS } from '../constants';
import { canPlay, isWinningMove, play, type Position } from './bitboard';
import { evaluatePosition } from './eval';

/**
 * Negamax search with α-β pruning, transposition table, killer moves, and
 * iterative deepening. Returns scores from the current mover's perspective —
 * larger is better for the player to move.
 *
 * Score scheme
 * ------------
 *   Terminal win    : MATE_SCORE - pos.moves - 1  (winning sooner > later)
 *   Heuristic leaf  : bounded well below MATE_SCORE so a real mate always beats any heuristic value
 *   Drawn position  : 0
 *
 * Performance levers
 * ------------------
 *   1. Transposition table — keyed on a canonical 98-bit composite of position
 *      + mask, with depth-bounded entries holding {score, flag, bestMove}.
 *      Cuts node count dramatically on positions reachable by multiple move
 *      orders, which is most of them.
 *   2. Iterative deepening — search depth 1, 2, 3, … up to the requested limit.
 *      Each pass leaves TT entries with a `bestMove`, which the next pass tries
 *      first; that alone usually halves the node count of the final pass.
 *   3. Killer-move heuristic — at each ply we remember the last two moves that
 *      caused a β-cutoff and try them ahead of the static center-out order.
 *   4. Time budget — `scoreAllMoves` accepts a deadline and aborts cleanly when
 *      it lapses. The iterative-deepening wrapper discards the unfinished pass
 *      and returns the last completed one, so we never return garbage.
 */

const MAX_MOVES = COLUMNS * ROWS; // 42

/**
 * Comfortably above any heuristic value the leaf evaluator can produce, so
 * proven mates always sort above heuristic scores. The MATE_SCORE - pos.moves
 * offset makes "win in N" preferred over "win in N+1".
 */
export const MATE_SCORE = 100000;

/** Above which a score is treated as a proven win/loss (mate-in-K). */
const MATE_THRESHOLD = MATE_SCORE - MAX_MOVES;

// Center-out static order: in Connect 4 the middle column dominates, then
// adjacency falls off symmetrically. This is the baseline ordering — TT-best
// move and killers override per-position.
const STATIC_ORDER: readonly number[] = [3, 4, 2, 5, 1, 6, 0];

const FLAG_EXACT = 0;
const FLAG_LOWER = 1; // stored score is a lower bound on true score
const FLAG_UPPER = 2; // stored score is an upper bound on true score
type TTFlag = typeof FLAG_EXACT | typeof FLAG_LOWER | typeof FLAG_UPPER;

type TTEntry = {
  score: number;
  /** Search depth that produced this entry — re-usable only if ≥ current need. */
  depth: number;
  flag: TTFlag;
  /** -1 if no move was tried (e.g. terminal). Otherwise the best (or first refuting) column. */
  bestMove: number;
};

/**
 * Canonical position key. Bitboard cells fit in 49 bits per side, so packing
 * (mask, position) into 98 bits gives a collision-free key — every distinct
 * position maps to a distinct BigInt. Map keys on BigInt are hashed natively
 * (Node/V8) without string conversion.
 */
const positionKey = (pos: Position): bigint =>
  pos.position | (pos.mask << 49n);

type SearchCtx = {
  tt: Map<bigint, TTEntry>;
  /** killers[ply] = up to two columns that recently caused a β-cutoff at that ply. */
  killers: number[][];
  /** Absolute deadline in performance.now() ms; 0 disables time checks. */
  deadline: number;
  aborted: boolean;
  nodes: number;
};

/**
 * Node-count interval between deadline checks. performance.now() is fast but
 * not free; checking every 4096 nodes keeps overhead near 0% while bounding
 * overshoot to a handful of ms at typical search rates.
 */
const NODE_CHECK_MASK = 4095; // power-of-two − 1 for bitmask test

const checkDeadline = (ctx: SearchCtx): void => {
  if (ctx.deadline === 0) return;
  if (performance.now() > ctx.deadline) ctx.aborted = true;
};

/**
 * Ordered move list for a node. The TT's bestMove (if present) goes first,
 * then the two killer columns for this ply, then the static center-out order
 * for everything else. Duplicates and unplayable columns are filtered.
 */
const orderMoves = (
  pos: Position,
  ttMove: number,
  killers: readonly number[] | undefined,
): number[] => {
  const out: number[] = [];
  const seen = new Uint8Array(COLUMNS);
  const push = (c: number): void => {
    if (c < 0 || c >= COLUMNS) return;
    if (seen[c]) return;
    if (!canPlay(pos, c)) return;
    seen[c] = 1;
    out.push(c);
  };
  push(ttMove);
  if (killers) {
    push(killers[0] ?? -1);
    push(killers[1] ?? -1);
  }
  for (const c of STATIC_ORDER) push(c);
  return out;
};

const recordKiller = (killers: number[][], ply: number, col: number): void => {
  let slot = killers[ply];
  if (slot === undefined) {
    slot = [];
    killers[ply] = slot;
  }
  if (slot[0] === col) return; // already the primary killer
  slot[1] = slot[0];
  slot[0] = col;
};

const negamax = (
  pos: Position,
  depth: number,
  alphaIn: number,
  betaIn: number,
  ply: number,
  ctx: SearchCtx,
): number => {
  // Periodic deadline check — the returned score is meaningless when aborted,
  // but we still need to unwind cleanly. The IDS wrapper discards any pass
  // that touched ctx.aborted, so propagated garbage never reaches the caller.
  if ((++ctx.nodes & NODE_CHECK_MASK) === 0) checkDeadline(ctx);
  if (ctx.aborted) return 0;

  // Draw by exhaustion.
  if (pos.moves === MAX_MOVES) return 0;

  // Immediate-win shortcut: if any legal move wins right now, take the
  // shortest mate score and return. This skips both the TT lookup and the
  // recursion below for terminal-in-1 nodes — a frequent case.
  for (const col of STATIC_ORDER) {
    if (canPlay(pos, col) && isWinningMove(pos, col)) {
      return MATE_SCORE - pos.moves - 1;
    }
  }

  if (depth === 0) return evaluatePosition(pos);

  let alpha = alphaIn;
  let beta = betaIn;
  const key = positionKey(pos);
  const tte = ctx.tt.get(key);
  let ttMove = -1;
  if (tte !== undefined) {
    ttMove = tte.bestMove;
    if (tte.depth >= depth) {
      const s = tte.score;
      if (tte.flag === FLAG_EXACT) return s;
      if (tte.flag === FLAG_LOWER) {
        if (s > alpha) alpha = s;
      } else if (tte.flag === FLAG_UPPER) {
        if (s < beta) beta = s;
      }
      if (alpha >= beta) return s;
    }
  }

  let best = -MATE_SCORE * 2;
  let bestMove = -1;
  const moves = orderMoves(pos, ttMove, ctx.killers[ply]);

  for (const col of moves) {
    const child = play(pos, col);
    const score = -negamax(child, depth - 1, -beta, -alpha, ply + 1, ctx);
    if (ctx.aborted) return 0;
    if (score > best) {
      best = score;
      bestMove = col;
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) {
      recordKiller(ctx.killers, ply, col);
      break;
    }
  }

  // TT store. Flag follows the standard fail-soft convention:
  //   best ≤ alphaIn  → upper bound (no move raised α; true value is ≤ best)
  //   best ≥ beta     → lower bound (β-cutoff; true value is ≥ best)
  //   else            → exact value within the (alphaIn, beta) window
  const flag: TTFlag =
    best <= alphaIn ? FLAG_UPPER : best >= betaIn ? FLAG_LOWER : FLAG_EXACT;
  ctx.tt.set(key, { score: best, depth, flag, bestMove });
  return best;
};

export type ScoredMove = { col: number; score: number };

export type SearchOptions = {
  /** Hard upper bound on iterative-deepening depth. Cap at MAX_MOVES to allow full solve. */
  maxDepth: number;
  /**
   * Soft wall-clock budget. The current iteration is allowed to finish if it's
   * already started; deeper iterations only begin if the deadline hasn't passed.
   * 0 disables time checks (the search runs to maxDepth unconditionally).
   */
  budgetMs: number;
};

/**
 * Top-level entry: iterative deepening + per-iteration root move loop. Returns
 * the moves of the deepest *completed* iteration, sorted best-first.
 *
 * Iteration cadence: a fresh TT is allocated per call. The TT persists across
 * the iterations *within* this call, so depth-(d-1) results massively help
 * order depth-d searches. We deliberately don't keep the TT across calls — the
 * board has changed, many entries are stale, and 42-cell games don't repeat
 * positions enough to justify the bookkeeping.
 */
export const scoreAllMoves = (
  pos: Position,
  options: SearchOptions,
): ScoredMove[] => {
  const ctx: SearchCtx = {
    tt: new Map(),
    killers: [],
    deadline: options.budgetMs > 0 ? performance.now() + options.budgetMs : 0,
    aborted: false,
    nodes: 0,
  };

  // Cap effective depth at "moves remaining" — beyond that, deeper iterations
  // are pure waste because the tree's already exhausted. When maxDepth meets
  // this cap, the search becomes a strong solver: a completed iteration at
  // depth = movesRemaining is exhaustive, and its score is the true game-
  // theoretic value of the position.
  const movesRemaining = MAX_MOVES - pos.moves;
  const effectiveMax = Math.min(options.maxDepth, movesRemaining);

  let best: ScoredMove[] = [];

  for (let depth = 1; depth <= effectiveMax; depth++) {
    // Run a depth-`depth` search at the root, collecting per-move scores so
    // the engine can pick the best (or near-best). We don't reuse `negamax`
    // here because we want all root scores, not just an α-β-pruned best.
    const scored: ScoredMove[] = [];
    let alpha = -MATE_SCORE * 2;
    const beta = MATE_SCORE * 2;
    let rootBestMove = -1;

    // Root move ordering mirrors orderMoves: TT-best first, then static order.
    const rootKey = positionKey(pos);
    const rootTte = ctx.tt.get(rootKey);
    const rootTtMove = rootTte?.bestMove ?? -1;
    const rootMoves = orderMoves(pos, rootTtMove, undefined);

    for (const col of rootMoves) {
      let score: number;
      if (isWinningMove(pos, col)) {
        score = MATE_SCORE - pos.moves - 1;
      } else {
        const child = play(pos, col);
        score = -negamax(child, depth - 1, -beta, -alpha, 1, ctx);
      }
      if (ctx.aborted) break;
      scored.push({ col, score });
      if (score > alpha) {
        alpha = score;
        rootBestMove = col;
      }
    }

    if (ctx.aborted) break;

    // Stash the root's best move in the TT so the next iteration probes it first.
    if (rootBestMove !== -1) {
      ctx.tt.set(rootKey, {
        score: alpha,
        depth,
        flag: FLAG_EXACT,
        bestMove: rootBestMove,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    best = scored;

    // Early exit on proven mate — deeper searches can only confirm it, never
    // contradict it, and we'd rather get the move on screen quickly.
    if (best.length > 0 && Math.abs(best[0].score) >= MATE_THRESHOLD) break;
  }

  // Guarantee at least one move is returned. The depth-1 pass is so cheap
  // (≤ 7 leaf evals) that even a microsecond-tight budget completes it. But
  // belt-and-suspenders: if `best` somehow stayed empty, fall back to a
  // raw root scan with no recursion.
  if (best.length === 0) {
    for (const col of STATIC_ORDER) {
      if (!canPlay(pos, col)) continue;
      const score = isWinningMove(pos, col)
        ? MATE_SCORE - pos.moves - 1
        : evaluatePosition(play(pos, col)) * -1;
      best.push({ col, score });
    }
    best.sort((a, b) => b.score - a.score);
  }

  return best;
};
