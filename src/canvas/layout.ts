import { COLUMNS, ROWS } from '../constants';

/**
 * All measurements and hit-boxes for the canvas scene, derived from the
 * canvas's current logical (CSS) size. Recompute on resize.
 */
export type Layout = {
  width: number;
  height: number;
  /** Linear scale factor against the design width of 700. */
  scale: number;

  clocks: {
    top: number;
    height: number;
    /** Center X of each clock card. */
    centers: [number, number];
    cardWidth: number;
    cardHeight: number;
    cardRadius: number;
  };

  board: {
    x: number;
    y: number;
    width: number;
    height: number;
    topArchHeight: number;
    bottomArchHeight: number;
    bodyTop: number;
    bodyHeight: number;
    /** Inner padding inside the board body (the yellow band around the holes). */
    padding: number;
  };

  cell: {
    size: number;
    holeRadius: number;
    pieceRadius: number;
    glowRadius: number;
  };

  overlay: {
    card: {
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number;
    };
    messageY: number;
    button: {
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number;
    };
  };

  /**
   * Small "MENU" button rendered in the top-right corner during gameplay.
   * Opens the mid-game reset confirmation modal.
   */
  menuButton: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  };
};

const DESIGN_WIDTH = 700;

export const computeLayout = (width: number, height: number): Layout => {
  const scale = width / DESIGN_WIDTH;

  // ───── clocks band ─────
  const clocksTop = 24 * scale;
  const clocksCardWidth = 200 * scale;
  const clocksCardHeight = 80 * scale;
  const clocksGap = 40 * scale;
  const clocksTotalWidth = clocksCardWidth * 2 + clocksGap;
  const clocksLeft = (width - clocksTotalWidth) / 2;
  const clocksCenters: [number, number] = [
    clocksLeft + clocksCardWidth / 2,
    clocksLeft + clocksCardWidth + clocksGap + clocksCardWidth / 2,
  ];

  // ───── board ─────
  const boardTop = clocksTop + clocksCardHeight + 32 * scale;
  const boardWidth = Math.min(width * 0.96, 640 * scale);
  const boardX = (width - boardWidth) / 2;

  const topArchHeight = 22 * scale;
  const bottomArchHeight = 60 * scale;
  const padding = 12 * scale;
  const usableBoardWidth = boardWidth - padding * 2;
  const cellSize = usableBoardWidth / COLUMNS;
  const bodyHeight = cellSize * ROWS + padding * 2;
  const boardHeight = topArchHeight + bodyHeight + bottomArchHeight;

  // Cap height so layout fits if the container is shorter than expected.
  const maxBoardHeight = height - boardTop - 24 * scale;
  const heightFits = boardHeight <= maxBoardHeight;
  const finalScale = heightFits ? 1 : maxBoardHeight / boardHeight;
  // Note: if !heightFits we let things overflow rather than re-deriving every
  // metric. The container's CSS aspect-ratio is what really keeps things sane.
  void finalScale;

  // ───── end-game banner ─────
  //
  // Replaces the previous board-covering card. The banner now occupies the
  // same vertical band as the clocks (top of canvas) so the board stays
  // fully visible during the end-of-game pause and the menu prompt.
  const overlayCardWidth = clocksTotalWidth;
  const overlayCardHeight = clocksCardHeight;
  const overlayCardX = clocksLeft;
  const overlayCardY = clocksTop;
  const overlayCardRadius = 12 * scale;

  // Menu button sits inside the banner on the right edge.
  const buttonWidth = 100 * scale;
  const buttonHeight = 38 * scale;
  const buttonX = overlayCardX + overlayCardWidth - buttonWidth - 14 * scale;
  const buttonY = overlayCardY + (overlayCardHeight - buttonHeight) / 2;
  const buttonRadius = 8 * scale;

  // ───── in-game menu button (top-right) ─────
  const menuButtonWidth = 76 * scale;
  const menuButtonHeight = 30 * scale;
  const menuButtonX = width - menuButtonWidth - 16 * scale;
  const menuButtonY = 16 * scale;
  const menuButtonRadius = 6 * scale;

  return {
    width,
    height,
    scale,
    clocks: {
      top: clocksTop,
      height: clocksCardHeight,
      centers: clocksCenters,
      cardWidth: clocksCardWidth,
      cardHeight: clocksCardHeight,
      cardRadius: 10 * scale,
    },
    board: {
      x: boardX,
      y: boardTop,
      width: boardWidth,
      height: boardHeight,
      topArchHeight,
      bottomArchHeight,
      bodyTop: boardTop + topArchHeight,
      bodyHeight,
      padding,
    },
    cell: {
      size: cellSize,
      holeRadius: cellSize * 0.43,
      pieceRadius: cellSize * 0.43,
      glowRadius: cellSize * 0.47,
    },
    overlay: {
      card: {
        x: overlayCardX,
        y: overlayCardY,
        width: overlayCardWidth,
        height: overlayCardHeight,
        radius: overlayCardRadius,
      },
      messageY: overlayCardY + overlayCardHeight / 2,
      button: {
        x: buttonX,
        y: buttonY,
        width: buttonWidth,
        height: buttonHeight,
        radius: buttonRadius,
      },
    },
    menuButton: {
      x: menuButtonX,
      y: menuButtonY,
      width: menuButtonWidth,
      height: menuButtonHeight,
      radius: menuButtonRadius,
    },
  };
};

/** Center coordinates of cell (col, row) in canvas space. */
export const cellCenter = (
  layout: Layout,
  col: number,
  row: number,
): { x: number; y: number } => {
  const { board, cell } = layout;
  const x = board.x + board.padding + (col + 0.5) * cell.size;
  const y = board.bodyTop + board.padding + (row + 0.5) * cell.size;
  return { x, y };
};

/** Returns the column index at canvas x, or null if outside the board. */
export const columnAt = (layout: Layout, x: number, y: number): number | null => {
  const { board } = layout;
  if (x < board.x + board.padding) return null;
  if (x > board.x + board.width - board.padding) return null;
  if (y < board.y) return null;
  if (y > board.y + board.height) return null;
  const col = Math.floor((x - board.x - board.padding) / layout.cell.size);
  if (col < 0 || col >= COLUMNS) return null;
  return col;
};

/** True when the canvas point (x, y) lies inside the reset button rect. */
export const isInResetButton = (layout: Layout, x: number, y: number): boolean => {
  const b = layout.overlay.button;
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
};

/** True when (x, y) lies inside the in-game MENU button (top-right). */
export const isInMenuButton = (layout: Layout, x: number, y: number): boolean => {
  const b = layout.menuButton;
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
};
