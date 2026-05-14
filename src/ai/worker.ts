/// <reference lib="WebWorker" />

/**
 * Web-worker entry point for the AI engine. Receives `choose` requests on the
 * main thread, runs the (synchronous) negamax search off-thread, and posts
 * back the chosen column. Keeps the UI responsive — the rAF loop, drop
 * animations, and CPU-thinking pulse all keep ticking while hard mode burns
 * its 2.5s search budget.
 *
 * Cancellation
 * ------------
 * Web workers are single-threaded: an inbound `cancel` message can't fire
 * while a synchronous `negamax` loop is mid-execution. The only reliable
 * abort is `worker.terminate()` from the main thread (see engineClient.ts).
 * That's why this worker exposes only one operation; respawn-on-cancel keeps
 * the contract dead simple and the worker stateless.
 */

import { chooseMove } from './engine';
import type { Difficulty, GameBoard, Player } from '../constants';

export type WorkerRequest = {
  type: 'choose';
  id: number;
  board: GameBoard;
  currentPlayer: Player;
  difficulty: Difficulty;
};

export type WorkerResponse = {
  type: 'result';
  id: number;
  col: number;
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, board, currentPlayer, difficulty } = event.data;
  const col = chooseMove(board, currentPlayer, difficulty);
  const response: WorkerResponse = { type: 'result', id, col };
  (self as DedicatedWorkerGlobalScope).postMessage(response);
};
