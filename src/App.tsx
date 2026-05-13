import { useEffect, useRef } from 'react';

import { useGameStore } from './store';
import { COLUMNS, ROWS } from './constants';
import { computeLayout, type Layout } from './canvas/layout';
import { cellKey, createAnimState } from './canvas/animations';
import { paint } from './canvas/scene';
import { setupInputs } from './canvas/input';

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Surface a couple of slices to React purely for a11y / cursor:
  //   - showOverlay drives the screen-reader-only Reset button.
  //   - winner / isDraw feed its accessible label.
  // Everything *visible* is painted on the canvas.
  const showOverlay = useGameStore((s) => s.showOverlay);
  const winner = useGameStore((s) => s.winner);
  const isDraw = useGameStore((s) => s.isDraw);
  const resetGame = useGameStore((s) => s.resetGame);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const incTimer = useGameStore((s) => s.incTimer);

  // Kick off the @font-face download. Canvas font references don't always
  // trigger a fetch on their own; the rAF loop will pick up the real font
  // on whatever frame fires after the network request resolves.
  useEffect(() => {
    document.fonts.load('36px "Lilita One"').catch(() => {
      /* fallback to system-ui is acceptable */
    });
  }, []);

  // Wall-clock timer: only ticks while the game is live, cleaned up on pause.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(incTimer, 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, incTimer]);

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

    // Watch the store for new pieces / overlay transitions.
    const unsubscribe = useGameStore.subscribe((state, prev) => {
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

      if (state.showOverlay && !prev.showOverlay) {
        anim.overlayShownAt = now;
      } else if (!state.showOverlay && prev.showOverlay) {
        anim.overlayShownAt = null;
      }
    });

    const detachInputs = setupInputs({
      canvas,
      getLayout: () => layout,
      anim,
      store: useGameStore,
    });

    let rafId = 0;
    const tick = (now: number) => {
      paint(ctx, layout, useGameStore.getState(), anim, now);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      detachInputs();
      unsubscribe();
    };
  }, []);

  const overlayLabel = isDraw
    ? 'Game ended in a draw. Press Enter to reset.'
    : `Player ${winner ?? ''} wins. Press Enter to reset.`;

  return (
    <div className="App">
      <div ref={wrapRef} className="canvas-wrap">
        <canvas ref={canvasRef} aria-label="Connect 4 game board" role="img" />
        {/*
          Visually-hidden Reset button. The visible Reset is canvas-painted;
          this one exists purely so screen-reader / keyboard-only users can
          still finish a game. autoFocus pulls focus when the overlay opens.
        */}
        {showOverlay && (
          <button
            type="button"
            className="sr-only"
            onClick={resetGame}
            autoFocus
          >
            {overlayLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default App;
