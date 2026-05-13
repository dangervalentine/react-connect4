import type { useGameStore } from '../store';
import { ROWS } from '../constants';
import type { Layout } from './layout';
import { columnAt, isInMenuButton, isInResetButton } from './layout';
import type { AnimState } from './animations';

type Store = typeof useGameStore;

type InputCtx = {
  canvas: HTMLCanvasElement;
  /** Latest layout — read fresh on each event since resizes change geometry. */
  getLayout: () => Layout;
  anim: AnimState;
  store: Store;
};

type ReadonlyState = ReturnType<Store['getState']>;

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
 * True iff the human player is allowed to drop a piece *right now*. Blocked
 * during AI turns and while the AI is computing, so spamming the canvas can't
 * race the AI's setTimeout-deferred move.
 */
const isHumanTurn = (state: ReadonlyState): boolean => {
  if (state.gamePhase !== 'playing') return false;
  if (!state.isPlaying) return false;
  if (state.aiThinking) return false;
  if (state.aiPlayer === null) return true;
  return state.currentPlayer !== state.aiPlayer;
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
      anim.menuHovered = false;
    } else {
      anim.resetHovered = false;
      // The MENU button is only shown when there's no end-game overlay.
      anim.menuHovered =
        state.gamePhase === 'playing' && isInMenuButton(layout, x, y);
    }

    if (!isHumanTurn(state)) {
      anim.hoveredColumn = null;
      return;
    }
    anim.hoveredColumn = columnAt(layout, x, y);
  };

  const tryDropInColumn = (col: number) => {
    const state = store.getState();
    if (!isHumanTurn(state)) return;
    const row = firstFreeRow(state.gameBoard[col]);
    if (row < 0) return;
    state.addPiece(row, col);
  };

  const onMouseMove = (event: MouseEvent) => {
    const { x, y } = eventPoint(canvas, event);
    updateHoverFromPoint(x, y);
    const interactive =
      anim.resetHovered || anim.menuHovered || anim.hoveredColumn !== null;
    canvas.style.cursor = interactive ? 'pointer' : 'default';
  };

  const onMouseLeave = () => {
    anim.hoveredColumn = null;
    anim.resetHovered = false;
    anim.menuHovered = false;
    canvas.style.cursor = 'default';
  };

  const onClick = (event: MouseEvent) => {
    const { x, y } = eventPoint(canvas, event);
    const layout = getLayout();
    const state = store.getState();

    // End-of-game "Menu" button: returns to the welcome modal.
    if (state.showOverlay && isInResetButton(layout, x, y)) {
      state.openSetup();
      anim.hoveredColumn = null;
      anim.resetHovered = false;
      return;
    }

    // In-game MENU button: opens the "return to setup?" confirmation.
    if (
      state.gamePhase === 'playing' &&
      !state.showOverlay &&
      isInMenuButton(layout, x, y)
    ) {
      state.requestReset();
      anim.menuHovered = false;
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
      state.openSetup();
      anim.hoveredColumn = null;
      anim.resetHovered = false;
      return;
    }

    if (
      state.gamePhase === 'playing' &&
      !state.showOverlay &&
      isInMenuButton(layout, x, y)
    ) {
      state.requestReset();
      anim.menuHovered = false;
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
    anim.menuHovered = false;
  };

  // Keyboard: digits 1–7 drop in that column when it's the human's turn;
  // R / Enter / Space reset when the win/draw overlay is showing; Escape
  // opens the mid-game menu. Keeps the game playable without a pointer.
  const onKeyDown = (event: KeyboardEvent) => {
    const state = store.getState();

    if (state.showOverlay) {
      // After a game ends, the only action is returning to the welcome
      // modal — Enter / Space / M all do it.
      if (
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key === 'm' ||
        event.key === 'M'
      ) {
        event.preventDefault();
        state.openSetup();
      }
      return;
    }

    if (state.gamePhase !== 'playing') return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (state.showResetConfirm) {
        state.cancelResetRequest();
      } else {
        state.requestReset();
      }
      return;
    }

    if (state.showResetConfirm) return; // confirmation modal owns the keyboard

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
