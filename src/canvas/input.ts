import type { useGameStore } from '../store';
import { ROWS } from '../constants';
import type { Layout } from './layout';
import { columnAt, isInResetButton } from './layout';
import type { AnimState } from './animations';

type Store = typeof useGameStore;

type InputCtx = {
  canvas: HTMLCanvasElement;
  /** Latest layout — read fresh on each event since resizes change geometry. */
  getLayout: () => Layout;
  anim: AnimState;
  store: Store;
};

const eventPoint = (
  canvas: HTMLCanvasElement,
  event: MouseEvent | Touch,
): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

/** Top-most empty row in a column, or -1 if full. */
const firstFreeRow = (column: ReadonlyArray<number>): number => {
  const firstNonZero = column.findIndex((v) => v !== 0);
  if (firstNonZero === -1) return ROWS - 1;
  return firstNonZero - 1;
};

/**
 * Wire up pointer and keyboard handlers on the canvas. Returns a cleanup
 * function that detaches everything.
 */
export const setupInputs = (ctx: InputCtx): (() => void) => {
  const { canvas, getLayout, anim, store } = ctx;

  const updateHoverFromPoint = (x: number, y: number) => {
    const layout = getLayout();
    const state = store.getState();

    // Reset button hover is only meaningful when the overlay is showing.
    if (state.showOverlay) {
      anim.resetHovered = isInResetButton(layout, x, y);
    } else {
      anim.resetHovered = false;
    }

    if (!state.isPlaying) {
      anim.hoveredColumn = null;
      return;
    }
    anim.hoveredColumn = columnAt(layout, x, y);
  };

  const tryDropInColumn = (col: number) => {
    const state = store.getState();
    if (!state.isPlaying) return;
    const row = firstFreeRow(state.gameBoard[col]);
    if (row < 0) return;
    state.addPiece(row, col);
  };

  const onMouseMove = (event: MouseEvent) => {
    const { x, y } = eventPoint(canvas, event);
    updateHoverFromPoint(x, y);
    canvas.style.cursor =
      anim.resetHovered || anim.hoveredColumn !== null ? 'pointer' : 'default';
  };

  const onMouseLeave = () => {
    anim.hoveredColumn = null;
    anim.resetHovered = false;
    canvas.style.cursor = 'default';
  };

  const onClick = (event: MouseEvent) => {
    const { x, y } = eventPoint(canvas, event);
    const layout = getLayout();
    const state = store.getState();

    if (state.showOverlay && isInResetButton(layout, x, y)) {
      state.resetGame();
      // Clear hover so the post-reset frame doesn't show a stale ghost.
      anim.hoveredColumn = null;
      anim.resetHovered = false;
      return;
    }

    const col = columnAt(layout, x, y);
    if (col !== null) tryDropInColumn(col);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 0) return;
    event.preventDefault();
    const touch = event.touches[0];
    const { x, y } = eventPoint(canvas, touch);
    updateHoverFromPoint(x, y);
    const layout = getLayout();
    const state = store.getState();

    if (state.showOverlay && isInResetButton(layout, x, y)) {
      state.resetGame();
      anim.hoveredColumn = null;
      anim.resetHovered = false;
      return;
    }

    const col = columnAt(layout, x, y);
    if (col !== null) tryDropInColumn(col);
  };

  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 0) return;
    const touch = event.touches[0];
    const { x, y } = eventPoint(canvas, touch);
    updateHoverFromPoint(x, y);
  };

  const onTouchEnd = () => {
    anim.hoveredColumn = null;
    anim.resetHovered = false;
  };

  // Keyboard: digits 1–7 drop in that column; R / Enter / Space reset when
  // the overlay is showing. Keeps the game playable without a pointer.
  const onKeyDown = (event: KeyboardEvent) => {
    const state = store.getState();

    if (state.showOverlay) {
      if (event.key === 'r' || event.key === 'R' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        state.resetGame();
      }
      return;
    }

    if (event.key >= '1' && event.key <= '7') {
      const col = parseInt(event.key, 10) - 1;
      tryDropInColumn(col);
    }
  };

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: true });
  canvas.addEventListener('touchend', onTouchEnd);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseleave', onMouseLeave);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('keydown', onKeyDown);
  };
};
