import { chooseMove } from './engine';
import type { WorkerRequest, WorkerResponse } from './worker';
import type { Difficulty, GameBoard, Player } from '../constants';

/**
 * Main-thread client for the AI worker. Exposes a single async API,
 * `chooseMoveAsync`, that off-loads negamax to a Web Worker so the UI stays
 * responsive during hard mode's multi-second searches.
 *
 * Lifecycle
 * ---------
 * The worker is created lazily on the first medium/hard call and kept alive
 * across moves — repeated postMessages avoid the ~10-50ms module-load cost
 * that fresh workers pay. On `cancelChooseMove`, we terminate and discard:
 * web workers can't be interrupted by inbound messages while running a
 * synchronous loop (no SharedArrayBuffer means no Atomics signal from the
 * main thread), so terminate is the only reliable abort. The next
 * chooseMoveAsync call respawns automatically.
 *
 * Cancellation contract
 * ---------------------
 * Cancelled promises NEVER resolve. Callers must guard against stale work
 * with their own freshness check (the existing aiGeneration counter in
 * App.tsx does exactly this) and treat the eventual-resolution contract as
 * "may never resolve". Orphan promise closures are GC'd once nothing
 * references them, so this doesn't leak.
 *
 * Easy difficulty bypasses the worker — it's heuristic-only and runs in
 * microseconds. The round-trip postMessage would dwarf the actual work.
 */

let worker: Worker | null = null;
let nextRequestId = 1;
let pending: { id: number; resolve: (col: number) => void } | null = null;

const ensureWorker = (): Worker => {
  if (worker !== null) return worker;
  // Vite recognises this exact `new URL` + `import.meta.url` idiom and
  // bundles ./worker.ts as a separate worker chunk; no plugin or config
  // needed. `type: 'module'` keeps ESM imports working inside the worker.
  worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    if (pending === null || pending.id !== event.data.id) return;
    const { resolve } = pending;
    pending = null;
    resolve(event.data.col);
  };
  return worker;
};

/**
 * Run `chooseMove` off the main thread. Returns the AI's chosen column.
 *
 * Concurrency: only one request is in flight at a time. If a previous call
 * is still pending when a new one comes in, the previous request is
 * cancelled (worker terminated and respawned) and its promise is orphaned.
 * The current AI scheduler in App.tsx never overlaps requests, so this is
 * a defence-in-depth rather than an everyday code path.
 */
export const chooseMoveAsync = (
  board: GameBoard,
  currentPlayer: Player,
  difficulty: Difficulty,
): Promise<number> => {
  // Easy is heuristic-only and runs in microseconds; bypass the worker
  // entirely so the attract demo and PvE-easy don't pay round-trip latency.
  if (difficulty === 'easy') {
    return Promise.resolve(chooseMove(board, currentPlayer, difficulty));
  }

  if (pending !== null) cancelChooseMove();
  const w = ensureWorker();
  const id = nextRequestId++;
  return new Promise<number>((resolve) => {
    pending = { id, resolve };
    const req: WorkerRequest = {
      type: 'choose',
      id,
      board,
      currentPlayer,
      difficulty,
    };
    w.postMessage(req);
  });
};

/**
 * Abort the in-flight search, if any. The promise returned by the
 * outstanding `chooseMoveAsync` call will never resolve — callers MUST
 * guard with a generation counter or similar staleness check. The next
 * `chooseMoveAsync` call respawns the worker.
 */
export const cancelChooseMove = (): void => {
  if (worker !== null) {
    worker.terminate();
    worker = null;
  }
  pending = null;
};
