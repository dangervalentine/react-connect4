import { useEffect, useRef } from 'react';

import { useGameStore } from './store';
import { COLUMNS, ROWS } from './constants';
import { computeLayout, type Layout } from './canvas/layout';
import {
  cellKey,
  createAnimState,
  DROP_DURATION_MS,
  winSequenceDuration,
} from './canvas/animations';
import { paint, paintAttract } from './canvas/scene';
import { setupInputs } from './canvas/input';
import { chooseMove } from './ai/engine';
import { createAttract, resetAttract, stepAttract } from './ai/attractDemo';
import { KeyboardHintsToggle } from './components/KeyboardHintsToggle';
import { WelcomeModal } from './components/WelcomeModal';
import { ResetConfirmModal } from './components/ResetConfirmModal';

/** Top-most empty row index for column, or -1 if full. Mirrors input.ts. */
const firstFreeRow = (column: ReadonlyArray<number>): number => {
  const firstNonZero = column.findIndex((v) => v !== 0);
  if (firstNonZero === -1) return ROWS - 1;
  return firstNonZero - 1;
};

/**
 * Minimum time the AI's move is held back. Two reasons:
 *   1. Without it, hard-difficulty moves look like a vending machine —
 *      instant responses break the illusion of "thinking".
 *   2. It also gives our setupInputs gate (which checks aiThinking) time
 *      to register, preventing rare race conditions if the user double-taps.
 */
const AI_THINK_MIN_MS = 350;

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Surface the slices that React needs to render — everything else is read
  // imperatively in the canvas loop or store subscribers.
  const gamePhase = useGameStore((s) => s.gamePhase);
  const showResetConfirm = useGameStore((s) => s.showResetConfirm);
  const showOverlay = useGameStore((s) => s.showOverlay);
  const winner = useGameStore((s) => s.winner);
  const isDraw = useGameStore((s) => s.isDraw);
  const openSetup = useGameStore((s) => s.openSetup);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const timersEnabled = useGameStore((s) => s.timersEnabled);
  const incTimer = useGameStore((s) => s.incTimer);

  // Kick off the @font-face download. Canvas font references don't always
  // trigger a fetch on their own; the rAF loop will pick up the real font
  // on whatever frame fires after the network request resolves.
  useEffect(() => {
    document.fonts.load('36px "Lilita One"').catch(() => {
      /* fallback to system-ui is acceptable */
    });
  }, []);

  // Wall-clock timer: ticks only while game is live AND timers are enabled.
  useEffect(() => {
    if (!isPlaying || !timersEnabled) return;
    const id = window.setInterval(incTimer, 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, timersEnabled, incTimer]);

  // Canvas setup: rAF loop, store subscription, resize handling, inputs.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // eslint-disable-next-line no-console
      console.error('2d context unavailable; the game cannot render.');
      return;
    }

    const anim = createAnimState();
    let layout: Layout = computeLayout(1, 1); // replaced on first resize

    const applySize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = wrap.getBoundingClientRect();
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // ctx.scale() compounds — use setTransform to reset and apply DPR.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout = computeLayout(width, height);
    };

    applySize();
    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(wrap);

    // Seed: if any pieces are already on the board (e.g. HMR), skip their
    // drop animation by recording a start-time well in the past.
    const seedFromBoard = () => {
      const state = useGameStore.getState();
      for (let col = 0; col < COLUMNS; col++) {
        for (let row = 0; row < ROWS; row++) {
          if (state.gameBoard[col][row] !== 0 && !anim.drops.has(cellKey(col, row))) {
            anim.drops.set(cellKey(col, row), performance.now() - 1000);
          }
        }
      }
      if (state.showOverlay && anim.overlayShownAt === null) {
        anim.overlayShownAt = performance.now();
      }
    };
    seedFromBoard();

    // ── win-sequence driver ──
    //
    // When a game ends, the store sets winner/winningPieces/gamePhase='finished'
    // but DEFERS showOverlay so the user gets to see the winning pieces light
    // up one by one before the banner appears. We:
    //
    //   1. Record `winSequenceStartedAt` offset by DROP_DURATION_MS so the
    //      highlight doesn't begin until the winning piece has actually
    //      landed (otherwise it'd be fading to white mid-air).
    //   2. Schedule revealEndOverlay() to fire DROP + sequence ms later.
    //
    // A generation counter discards stale timers if the game is reset before
    // the sequence completes (e.g. quickly through the MENU button).
    let endRevealTimer: number | null = null;
    let endRevealGen = 0;

    const cancelPendingReveal = () => {
      if (endRevealTimer !== null) {
        window.clearTimeout(endRevealTimer);
        endRevealTimer = null;
      }
    };

    // Watch the store for new pieces / overlay transitions / game-end transitions.
    const unsubscribeAnim = useGameStore.subscribe((state, prev) => {
      const now = performance.now();

      if (state.gameBoard !== prev.gameBoard) {
        for (let col = 0; col < COLUMNS; col++) {
          if (state.gameBoard[col] === prev.gameBoard[col]) continue;
          for (let row = 0; row < ROWS; row++) {
            const before = prev.gameBoard[col][row];
            const after = state.gameBoard[col][row];
            if (before === 0 && after !== 0) {
              anim.drops.set(cellKey(col, row), now);
            } else if (after === 0 && before !== 0) {
              anim.drops.delete(cellKey(col, row));
            }
          }
        }
      }

      // Game just ended: kick off the win sequence + schedule the banner.
      if (state.gamePhase === 'finished' && prev.gamePhase === 'playing') {
        anim.winSequenceStartedAt = now + DROP_DURATION_MS;
        const totalDelay =
          DROP_DURATION_MS + winSequenceDuration(state.winningPieces.length);
        const myGen = ++endRevealGen;
        cancelPendingReveal();
        endRevealTimer = window.setTimeout(() => {
          endRevealTimer = null;
          if (myGen !== endRevealGen) return;
          useGameStore.getState().revealEndOverlay();
        }, totalDelay);
      }

      // Game restarted or returned to setup: scrub the win sequence.
      if (state.gamePhase !== 'finished' && prev.gamePhase === 'finished') {
        anim.winSequenceStartedAt = null;
        ++endRevealGen;
        cancelPendingReveal();
      }

      if (state.showOverlay && !prev.showOverlay) {
        anim.overlayShownAt = now;
      } else if (!state.showOverlay && prev.showOverlay) {
        anim.overlayShownAt = null;
      }
    });

    // ── AI turn driver ──
    //
    // Every relevant store update is examined: if it's now the AI's turn and
    // we're not already mid-think, we schedule a move on a short timeout so
    // it feels deliberate and the "thinking" indicator gets a frame to show.
    //
    // Cancellation: a pending timer is cleared whenever the precondition stops
    // holding (player reset, game ended, returned to setup). A generation
    // counter guards against the rare case where the timer's callback fires
    // *just* after the game state changes but before our subscriber clears
    // the timer.
    let pendingAiTimer: number | null = null;
    let aiGeneration = 0;

    const cancelPendingAi = () => {
      if (pendingAiTimer !== null) {
        window.clearTimeout(pendingAiTimer);
        pendingAiTimer = null;
      }
      // Drop the "thinking" flag too — leaving it set would keep the
      // "CPU thinking…" indicator on screen indefinitely.
      const s = useGameStore.getState();
      if (s.aiThinking) s.setAiThinking(false);
    };

    type StoreState = ReturnType<typeof useGameStore.getState>;
    const shouldAiPlay = (s: StoreState): boolean =>
      s.gamePhase === 'playing' &&
      s.isPlaying &&
      s.aiPlayer !== null &&
      s.currentPlayer === s.aiPlayer &&
      // Pause AI while the user is staring at the reset-confirm dialog —
      // otherwise a move would slip in behind the blurred backdrop and the
      // game state on cancel wouldn't match what the user remembered.
      !s.showResetConfirm;

    const scheduleAiMove = () => {
      const state = useGameStore.getState();
      if (!shouldAiPlay(state)) return;
      if (state.aiThinking || pendingAiTimer !== null) return;

      const myGen = ++aiGeneration;
      state.setAiThinking(true);

      pendingAiTimer = window.setTimeout(() => {
        pendingAiTimer = null;
        const s = useGameStore.getState();
        // Stale generation? The game state changed during the wait — abandon.
        if (myGen !== aiGeneration || !shouldAiPlay(s)) {
          if (s.aiThinking) s.setAiThinking(false);
          return;
        }
        const col = chooseMove(s.gameBoard, s.currentPlayer, s.difficulty);
        const row = firstFreeRow(s.gameBoard[col]);
        if (row < 0) {
          s.setAiThinking(false);
          return;
        }
        s.addPiece(row, col);
      }, AI_THINK_MIN_MS);
    };

    const unsubscribeAi = useGameStore.subscribe((state) => {
      if (!shouldAiPlay(state)) {
        cancelPendingAi();
        return;
      }
      scheduleAiMove();
    });

    // Subscribers don't fire for initial state, so check once on mount in
    // case the AI should be moving first (e.g. HMR preserved an in-progress
    // PvE game). Microtask-delay to avoid surprises during effect setup.
    queueMicrotask(scheduleAiMove);

    const detachInputs = setupInputs({
      canvas,
      getLayout: () => layout,
      anim,
      store: useGameStore,
    });

    // ── attract demo ──
    //
    // While the welcome modal is open we run a self-playing easy-vs-easy game
    // behind it. Pieces drop on the canvas as a subtle ambient animation, get
    // visually muted by the modal's blurred backdrop, and reset between
    // matches. The attract owns its own board / anim state so the real game
    // (which lives in the store) is untouched until `startGame` runs.
    const attract = createAttract();
    const ATTRACT_TICK_MS = 850;
    let attractTimerId: number | null = null;

    const startAttract = () => {
      if (attractTimerId !== null) return;
      attractTimerId = window.setInterval(() => {
        stepAttract(attract, performance.now());
      }, ATTRACT_TICK_MS);
    };

    const stopAttract = () => {
      if (attractTimerId !== null) {
        window.clearInterval(attractTimerId);
        attractTimerId = null;
      }
      resetAttract(attract);
    };

    // Kick off immediately if we mount into setup (initial load — almost
    // always the case).
    if (useGameStore.getState().gamePhase === 'setup') {
      startAttract();
    }

    const unsubscribePhase = useGameStore.subscribe((state, prev) => {
      if (state.gamePhase === prev.gamePhase) return;
      if (state.gamePhase === 'setup') {
        startAttract();
      } else {
        stopAttract();
      }
    });

    let rafId = 0;
    const tick = (now: number) => {
      const state = useGameStore.getState();
      if (state.gamePhase === 'setup') {
        // Attract mode: separate paint path that ignores the store's board.
        paintAttract(
          ctx,
          layout,
          { gameBoard: attract.gameBoard, winningPieces: attract.winningPieces },
          attract.anim,
          now,
        );
      } else {
        paint(ctx, layout, state, anim, now);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      detachInputs();
      unsubscribeAnim();
      unsubscribeAi();
      unsubscribePhase();
      cancelPendingAi();
      cancelPendingReveal();
      stopAttract();
    };
  }, []);

  const overlayLabel = isDraw
    ? 'Game ended in a draw. Press Enter for menu.'
    : `Player ${winner ?? ''} wins. Press Enter for menu.`;

  return (
    <div className="App">
      <KeyboardHintsToggle />
      <div ref={wrapRef} className="canvas-wrap">
        <canvas ref={canvasRef} aria-label="Connect 4 game board" role="img" />
        {/*
          Visually-hidden Menu button. The visible button is canvas-painted;
          this one exists purely so screen-reader / keyboard-only users can
          still finish a game. autoFocus pulls focus when the overlay opens.
        */}
        {showOverlay && (
          <button
            type="button"
            className="sr-only"
            onClick={openSetup}
            autoFocus
          >
            {overlayLabel}
          </button>
        )}
      </div>
      {gamePhase === 'setup' && <WelcomeModal />}
      {showResetConfirm && gamePhase === 'playing' && <ResetConfirmModal />}
    </div>
  );
};

export default App;
