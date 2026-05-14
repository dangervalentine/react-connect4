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
import { cancelChooseMove, chooseMoveAsync } from './ai/engineClient';
import { createAttract, resetAttract, stepAttract } from './ai/attractDemo';
import { GithubAttribution } from './components/GithubAttribution';
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
 * Minimum on-screen time for the "CPU thinking…" pulse. Two reasons:
 *   1. Easy mode and immediate tactical wins resolve in microseconds —
 *      without a floor they look like a vending machine, breaking the
 *      illusion of deliberation.
 *   2. It also gives our setupInputs gate (which checks aiThinking) time
 *      to register, preventing rare race conditions if the user double-taps.
 *
 * Hard-mode searches now run in a worker (see ai/engineClient.ts), so the
 * search itself almost always exceeds this floor and the floor becomes a
 * no-op for those turns.
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

  // Warm both Google Fonts used by the canvas. Canvas font references don't
  // always trigger a fetch on their own; the rAF loop will pick up the real
  // font on whatever frame fires after the network request resolves. We
  // explicitly request representative sizes/weights so the right files get
  // pulled rather than the bundle's tiny fallback metrics.
  useEffect(() => {
    Promise.all([
      document.fonts.load('800 36px "Poppins"'),
      document.fonts.load('500 16px "Inter"'),
      document.fonts.load('700 14px "Inter"'),
    ]).catch(() => {
      /* fallback to system-ui is acceptable */
    });
  }, []);

  // Sync `keyboardHintsSupported` with the viewport. The query mirrors the
  // CSS rule that hides the toggle button (.kb-toggle): on touch devices and
  // narrow viewports there's no useful keyboard, so the painted hints
  // (column digits, Esc chip) and modal hint footers are suppressed too.
  const setKeyboardHintsSupported = useGameStore(
    (s) => s.setKeyboardHintsSupported,
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 720px), (hover: none)');
    const update = () => setKeyboardHintsSupported(!mql.matches);
    update(); // Seed before first paint.
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [setKeyboardHintsSupported]);

  // Global "K" shortcut to toggle keyboard hints. Single key (no Shift+/
  // gymnastics) and mnemonic for "Keyboard". Lives at the document level so
  // it works in every phase (setup, playing, finished, modals open). Bound
  // on the React side rather than the canvas input handler because the
  // canvas isn't always focused.
  const toggleKeyboardHints = useGameStore((s) => s.toggleKeyboardHints);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Ignore modifier-combos so we don't fight browser shortcuts like
      // Ctrl/Cmd+K (URL bar focus, etc).
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        toggleKeyboardHints();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleKeyboardHints]);

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
    // On the AI's turn we kick off chooseMoveAsync (which off-loads negamax to
    // a Web Worker so the UI stays responsive during hard mode's multi-second
    // burns) and start a parallel AI_THINK_MIN_MS minimum-delay timer. The
    // move is committed once both have completed.
    //
    // Cancellation: bumping aiGeneration causes the resolved-search callback
    // to bail via the staleness check; cancelChooseMove() terminates the
    // worker so it stops burning CPU; pendingMinDelayTimer is cleared so a
    // stale "place" callback can't fire after the user has reset the game.
    // The orphaned promise (from the in-flight chooseMoveAsync) never
    // resolves — that's intentional and safe; nothing references it after we
    // discard it, so the closure is GC'd.
    let pendingMinDelayTimer: number | null = null;
    let aiGeneration = 0;

    const cancelPendingAi = () => {
      // Bumping the generation discards any in-flight .then() callback.
      ++aiGeneration;
      cancelChooseMove();
      if (pendingMinDelayTimer !== null) {
        window.clearTimeout(pendingMinDelayTimer);
        pendingMinDelayTimer = null;
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
      // aiThinking gates re-entry — the existing turn is still resolving.
      if (state.aiThinking) return;

      const myGen = ++aiGeneration;
      state.setAiThinking(true);
      const startedAt = performance.now();

      void chooseMoveAsync(
        state.gameBoard,
        state.currentPlayer,
        state.difficulty,
      ).then((col) => {
        if (myGen !== aiGeneration) return; // cancelled or superseded mid-search

        const place = () => {
          pendingMinDelayTimer = null;
          if (myGen !== aiGeneration) return;
          const s = useGameStore.getState();
          if (!shouldAiPlay(s)) {
            if (s.aiThinking) s.setAiThinking(false);
            return;
          }
          const row = firstFreeRow(s.gameBoard[col]);
          if (row < 0) {
            s.setAiThinking(false);
            return;
          }
          s.addPiece(row, col);
        };

        // Hold the move until AI_THINK_MIN_MS has elapsed since the search
        // started, so the pulsing "CPU thinking…" indicator gets at least
        // one full beat on screen even when the search returned in
        // milliseconds (easy bypass, immediate tactical wins, etc.).
        const elapsed = performance.now() - startedAt;
        const remaining = AI_THINK_MIN_MS - elapsed;
        if (remaining > 0) {
          pendingMinDelayTimer = window.setTimeout(place, remaining);
        } else {
          place();
        }
      });
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
      <GithubAttribution />
    </div>
  );
};

export default App;
