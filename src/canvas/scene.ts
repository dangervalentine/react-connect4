import { COLUMNS, ROWS, type Cell, type GameBoard, type Player, type WinningPiece } from '../constants';
import type { useGameStore } from '../store';
import {
  cellCenter,
  type Layout,
} from './layout';
import {
  type AnimState,
  dropProgress,
  overlayBackdropAlpha,
  overlayCardProgress,
  winPulseRing,
  winPulseScale,
} from './animations';

type GameState = ReturnType<typeof useGameStore.getState>;

// ───────────────────────── palette ─────────────────────────

const C = {
  boardBlue: '#1565c0',
  boardYellow: '#fbc02d',
  pieceRed: '#f44336',
  pieceRedSoft: '#e57373',
  pieceBlack: '#1a1a1a',
  pieceBlackSoft: '#4a4a4a',
  pieceWinner: '#ffffff',
  columnHover: '#3498db',
  cardBg: '#e9e9e9',
  cardShadow: 'rgba(0, 0, 0, 0.25)',
  textOnBlue: '#ffffff',
  textOnCard: '#1565c0',
  clockBg: 'rgba(52, 73, 94, 0.25)',
  clockBgActive: 'rgba(52, 73, 94, 0.5)',
  buttonHover: '#ffffff',
} as const;

const colorFor = (player: Player): string =>
  player === 1 ? C.pieceRed : C.pieceBlack;
const softColorFor = (player: Player): string =>
  player === 1 ? C.pieceRedSoft : C.pieceBlackSoft;

// ───────────────────────── primitives ─────────────────────────

const roundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const circlePath = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void => {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
};

// ───────────────────────── pieces ─────────────────────────

/** Where the falling piece visually starts (well above the board). */
const dropStartY = (layout: Layout): number =>
  layout.board.y - layout.cell.size * 1.5;

const isWinningPiece = (
  winningPieces: ReadonlyArray<WinningPiece>,
  col: number,
  row: number,
): boolean =>
  winningPieces.some((p) => p.column === col && p.row === row);

/**
 * Draw all pieces for the given board. Board-agnostic so the attract path can
 * paint a separate self-play game without going through the store.
 */
const drawPiecesForBoard = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  gameBoard: GameBoard,
  winningPieces: ReadonlyArray<WinningPiece>,
  anim: AnimState,
  now: number,
): void => {
  const startY = dropStartY(layout);

  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const cellValue: Cell = gameBoard[col][row];
      if (cellValue === 0) continue;

      const finalCenter = cellCenter(layout, col, row);
      const progress = dropProgress(anim, col, row, now);
      const y = startY + (finalCenter.y - startY) * progress;
      const isWinner = isWinningPiece(winningPieces, col, row);

      // Draw the pulse ring under the piece while it pulses (only after the
      // drop has finished, otherwise it looks odd attached to a falling piece).
      if (isWinner && progress >= 1) {
        const ring = winPulseRing(now);
        ctx.save();
        ctx.globalAlpha = ring.alpha;
        ctx.strokeStyle = C.pieceWinner;
        ctx.lineWidth = layout.cell.size * 0.06;
        circlePath(
          ctx,
          finalCenter.x,
          finalCenter.y,
          layout.cell.pieceRadius * ring.radiusFactor,
        );
        ctx.stroke();
        ctx.restore();
      }

      const scale = isWinner && progress >= 1 ? winPulseScale(now) : 1;
      const radius = layout.cell.pieceRadius * scale;
      const fill = isWinner ? C.pieceWinner : colorFor(cellValue);

      // Subtle inner highlight for a slightly 3D look — top-left lighter.
      const gradient = ctx.createRadialGradient(
        finalCenter.x - radius * 0.3,
        y - radius * 0.3,
        radius * 0.1,
        finalCenter.x,
        y,
        radius,
      );
      gradient.addColorStop(0, isWinner ? '#ffffff' : softColorFor(cellValue));
      gradient.addColorStop(1, fill);

      ctx.fillStyle = gradient;
      circlePath(ctx, finalCenter.x, y, radius);
      ctx.fill();
    }
  }
};

// ───────────────────────── board (with holes) ─────────────────────────

const drawBoardWithHoles = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { board, cell } = layout;

  // Single path: top arch + body + bottom arch, with all 42 circular holes
  // subtracted via the even-odd fill rule. Pieces drawn earlier show through
  // the holes; everything else is covered by the yellow board face.
  ctx.beginPath();

  // Top arch (rounded top corners, flat bottom).
  ctx.moveTo(board.x + board.topArchHeight, board.y);
  ctx.lineTo(board.x + board.width - board.topArchHeight, board.y);
  ctx.quadraticCurveTo(
    board.x + board.width,
    board.y,
    board.x + board.width,
    board.y + board.topArchHeight,
  );
  ctx.lineTo(board.x + board.width, board.y + board.topArchHeight);
  // body
  ctx.lineTo(board.x + board.width, board.bodyTop + board.bodyHeight);
  // Bottom arch: rounded bottom corners.
  ctx.lineTo(
    board.x + board.width,
    board.bodyTop + board.bodyHeight + board.bottomArchHeight - board.topArchHeight,
  );
  ctx.quadraticCurveTo(
    board.x + board.width,
    board.bodyTop + board.bodyHeight + board.bottomArchHeight,
    board.x + board.width - board.topArchHeight,
    board.bodyTop + board.bodyHeight + board.bottomArchHeight,
  );
  ctx.lineTo(
    board.x + board.topArchHeight,
    board.bodyTop + board.bodyHeight + board.bottomArchHeight,
  );
  ctx.quadraticCurveTo(
    board.x,
    board.bodyTop + board.bodyHeight + board.bottomArchHeight,
    board.x,
    board.bodyTop + board.bodyHeight + board.bottomArchHeight - board.topArchHeight,
  );
  ctx.lineTo(board.x, board.bodyTop);
  ctx.lineTo(board.x, board.y + board.topArchHeight);
  ctx.quadraticCurveTo(board.x, board.y, board.x + board.topArchHeight, board.y);
  ctx.closePath();

  // Subpath per cell hole.
  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const c = cellCenter(layout, col, row);
      ctx.moveTo(c.x + cell.holeRadius, c.y);
      ctx.arc(c.x, c.y, cell.holeRadius, 0, Math.PI * 2);
    }
  }

  ctx.fillStyle = C.boardYellow;
  ctx.fill('evenodd');
};

// ───────────────────────── hover ─────────────────────────

const drawHover = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
): void => {
  if (!state.isPlaying) return;
  // Don't show a hover indicator while it's the AI's turn — the human can't
  // act, so a ghost piece would be misleading.
  if (state.aiPlayer !== null && state.currentPlayer === state.aiPlayer) return;
  if (anim.hoveredColumn === null) return;
  const col = anim.hoveredColumn;

  // First free row, top-most-empty. If column full, do nothing.
  const column = state.gameBoard[col];
  const firstNonZero = column.findIndex((v) => v !== 0);
  const freeRow = firstNonZero === -1 ? ROWS - 1 : firstNonZero - 1;
  if (freeRow < 0) return;

  const { board, cell } = layout;
  const colX = board.x + board.padding + col * cell.size;

  // Subtle column tint over the board body.
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = C.columnHover;
  ctx.fillRect(colX, board.bodyTop, cell.size, board.bodyHeight);
  ctx.restore();

  // Ghost piece in the top free slot.
  const ghost = cellCenter(layout, col, freeRow);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = softColorFor(state.currentPlayer);
  circlePath(ctx, ghost.x, ghost.y, cell.pieceRadius);
  ctx.fill();
  ctx.restore();
};

// ───────────────────────── clocks / turn indicator ─────────────────────────

/**
 * Format `seconds` as M:SS. Once you're a few minutes in, raw second-counts
 * stop being legible at a glance.
 */
const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const drawClocks = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
): void => {
  const { clocks, scale } = layout;
  const times: [number, number] = [state.playerOneTime, state.playerTwoTime];

  for (let i = 0; i < 2; i++) {
    const player = (i + 1) as Player;
    const isActive = state.isPlaying && state.currentPlayer === player;
    const cx = clocks.centers[i];
    const cardX = cx - clocks.cardWidth / 2;

    // Card background.
    roundedRectPath(
      ctx,
      cardX,
      clocks.top,
      clocks.cardWidth,
      clocks.cardHeight,
      clocks.cardRadius,
    );
    ctx.fillStyle = isActive ? C.clockBgActive : C.clockBg;
    ctx.fill();

    // Side stripe for the active player, in their color.
    if (isActive) {
      const stripeWidth = 4 * scale;
      ctx.fillStyle = colorFor(player);
      ctx.fillRect(
        cardX,
        clocks.top + 8 * scale,
        stripeWidth,
        clocks.cardHeight - 16 * scale,
      );
    }

    // Label — append "(CPU)" so it's clear who's the AI.
    const isAi = state.aiPlayer === player;
    ctx.fillStyle = C.textOnBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${12 * scale}px system-ui, sans-serif`;
    ctx.fillText(
      isAi ? `PLAYER ${player} (CPU)` : `PLAYER ${player}`,
      cx,
      clocks.top + 14 * scale,
    );

    // Time value, formatted M:SS.
    ctx.font = `${36 * scale}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(formatTime(times[i]), cx, clocks.top + clocks.cardHeight / 2 + 8 * scale);
  }
};

/**
 * Minimalist turn indicator used when timers are off. Centered in the band
 * where the clocks would otherwise live — a single colored disc + the active
 * player's label, with a small "(CPU)" suffix if it's the AI's turn.
 */
const drawTurnIndicator = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
): void => {
  const { clocks, scale } = layout;
  const cx = layout.width / 2;
  const cy = clocks.top + clocks.cardHeight / 2;

  const player = state.currentPlayer;
  const radius = 18 * scale;
  // Disc with a thin white outline for legibility on the blue background.
  circlePath(ctx, cx - 90 * scale, cy, radius);
  ctx.fillStyle = colorFor(player);
  ctx.fill();
  ctx.lineWidth = 2 * scale;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.stroke();

  ctx.fillStyle = C.textOnBlue;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `${22 * scale}px system-ui, sans-serif`;
  const isAi = state.aiPlayer === player;
  const label = state.isPlaying
    ? `Player ${player}${isAi ? ' (CPU)' : ''}'s turn`
    : `Player ${player}${isAi ? ' (CPU)' : ''}`;
  ctx.fillText(label, cx - 60 * scale, cy);
};

// ───────────────────────── in-game menu button + thinking indicator ─────────────────────────

const drawMenuButton = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  anim: AnimState,
): void => {
  const b = layout.menuButton;
  const hovered = anim.menuHovered;

  roundedRectPath(ctx, b.x, b.y, b.width, b.height, b.radius);
  ctx.fillStyle = hovered ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.18)';
  ctx.fill();
  ctx.lineWidth = 1 * layout.scale;
  ctx.strokeStyle = hovered ? C.boardBlue : 'rgba(255, 255, 255, 0.5)';
  ctx.stroke();

  ctx.fillStyle = hovered ? C.boardBlue : C.textOnBlue;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${12 * layout.scale}px system-ui, sans-serif`;
  ctx.fillText('MENU', b.x + b.width / 2, b.y + b.height / 2 + 1);
};

/**
 * Subtle pulsing "Thinking…" tag while the AI computes a move. Lives just
 * below the clock band, centered — short-lived so it doesn't dominate.
 */
const drawThinkingIndicator = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  now: number,
): void => {
  const { scale } = layout;
  const cx = layout.width / 2;
  const cy = layout.clocks.top + layout.clocks.cardHeight + 14 * scale;
  // 0..1 pulse over a ~1.2s period.
  const phase = (now % 1200) / 1200;
  const alpha = 0.55 + 0.45 * Math.sin(phase * Math.PI * 2);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.textOnBlue;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${13 * scale}px system-ui, sans-serif`;
  ctx.fillText('CPU thinking…', cx, cy);
  ctx.restore();
};

// ───────────────────────── board title ─────────────────────────

const drawBoardTitle = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { board, scale } = layout;
  const cx = board.x + board.width / 2;
  const cy = board.bodyTop + board.bodyHeight + board.bottomArchHeight / 2;

  ctx.fillStyle = C.pieceRed;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${36 * scale}px "Lilita One", system-ui, sans-serif`;
  ctx.fillText('CONNECT4', cx, cy);
};

// ───────────────────────── overlay ─────────────────────────

const drawOverlay = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
  now: number,
): void => {
  if (!state.showOverlay) return;

  const backdropAlpha = overlayBackdropAlpha(anim, now);
  const cardProgress = overlayCardProgress(anim, now);

  // Full-canvas backdrop.
  ctx.save();
  ctx.globalAlpha = backdropAlpha;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.restore();

  // Card — scaled slightly up, fading in.
  const card = layout.overlay.card;
  const scale = 0.94 + 0.06 * cardProgress;
  const cardCx = card.x + card.width / 2;
  const cardCy = card.y + card.height / 2;

  ctx.save();
  ctx.globalAlpha = cardProgress;
  ctx.translate(cardCx, cardCy);
  ctx.scale(scale, scale);
  ctx.translate(-cardCx, -cardCy);

  // Card body (cream) — single rounded rect with a drop shadow.
  ctx.save();
  ctx.shadowColor = C.cardShadow;
  ctx.shadowBlur = 24 * layout.scale;
  ctx.shadowOffsetY = 8 * layout.scale;
  roundedRectPath(ctx, card.x, card.y, card.width, card.height, card.radius);
  ctx.fillStyle = C.cardBg;
  ctx.fill();
  ctx.restore();

  // Blue top half — fill a rectangle clipped to the card's rounded shape so
  // the top corners stay rounded while the bottom edge is a clean divider.
  ctx.save();
  roundedRectPath(ctx, card.x, card.y, card.width, card.height, card.radius);
  ctx.clip();
  ctx.fillStyle = C.boardBlue;
  ctx.fillRect(card.x, card.y, card.width, card.height / 2);
  ctx.restore();

  // Message text.
  const message = state.isDraw
    ? "It's a draw"
    : `Player ${state.winner ?? state.currentPlayer} wins!`;
  ctx.fillStyle = C.textOnBlue;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${24 * layout.scale}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(message, cardCx, card.y + card.height * 0.25);

  // Reset button.
  const btn = layout.overlay.button;
  const hovered = anim.resetHovered;

  roundedRectPath(ctx, btn.x, btn.y, btn.width, btn.height, btn.radius);
  ctx.fillStyle = hovered ? C.buttonHover : C.boardBlue;
  ctx.fill();
  if (hovered) {
    ctx.lineWidth = 2 * layout.scale;
    ctx.strokeStyle = C.boardBlue;
    ctx.stroke();
  }

  ctx.fillStyle = hovered ? C.boardBlue : C.textOnBlue;
  ctx.font = `${16 * layout.scale}px system-ui, sans-serif`;
  ctx.fillText('Menu', btn.x + btn.width / 2, btn.y + btn.height / 2 + 1);

  ctx.restore();
};

// ───────────────────────── attract paint ─────────────────────────

/**
 * View model for the attract self-play running behind the welcome modal.
 * Painted independently from the real game so the two can't collide.
 */
export type AttractView = {
  gameBoard: GameBoard;
  winningPieces: ReadonlyArray<WinningPiece>;
};

/**
 * Slim paint path for setup mode: just background + pieces + board + title.
 * No clocks, no menu button, no hover ghost, no end-game overlay — the
 * welcome modal sits in front of all of that.
 */
export const paintAttract = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  view: AttractView,
  anim: AnimState,
  now: number,
): void => {
  ctx.fillStyle = C.boardBlue;
  ctx.fillRect(0, 0, layout.width, layout.height);

  drawPiecesForBoard(ctx, layout, view.gameBoard, view.winningPieces, anim, now);
  drawBoardWithHoles(ctx, layout);
  drawBoardTitle(ctx, layout);
};

// ───────────────────────── paint ─────────────────────────

export const paint = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
  now: number,
): void => {
  // 1. Background. Always painted; everything else stacks on top.
  ctx.fillStyle = C.boardBlue;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // During the welcome modal we hold the canvas mostly blank — a full DOM
  // modal sits in front, and rendering pieces/clocks here would be visual
  // noise behind it. We still paint the board so the canvas isn't an empty
  // rectangle if the modal is dismissed via Escape.
  if (state.gamePhase === 'setup') {
    drawBoardWithHoles(ctx, layout);
    drawBoardTitle(ctx, layout);
    return;
  }

  // 2. Clocks or minimal turn indicator, depending on config.
  if (state.timersEnabled) {
    drawClocks(ctx, layout, state);
  } else {
    drawTurnIndicator(ctx, layout, state);
  }

  // 3. Pieces — drawn in their current positions (some may be above the
  //    board area mid-drop; those will remain visible since the yellow board
  //    layer only covers the rectangle below).
  drawPiecesForBoard(ctx, layout, state.gameBoard, state.winningPieces, anim, now);

  // 4. Yellow board face with circular holes. Pieces in step 3 show through
  //    the holes; the rest is covered by yellow.
  drawBoardWithHoles(ctx, layout);

  // 5. Hover indicator + ghost piece. Drawn after the board so the ghost
  //    appears INSIDE the appropriate hole and the column tint sits on top
  //    of the yellow band.
  drawHover(ctx, layout, state, anim);

  // 6. "CONNECT4" title.
  drawBoardTitle(ctx, layout);

  // 7. In-game MENU button (top-right). Hidden once the win/draw overlay is
  //    up — that overlay has its own Reset button.
  if (!state.showOverlay) {
    drawMenuButton(ctx, layout, anim);
  }

  // 8. AI "thinking" pulse, layered above the board but below the overlay.
  if (state.aiThinking) {
    drawThinkingIndicator(ctx, layout, now);
  }

  // 9. End-of-game overlay.
  drawOverlay(ctx, layout, state, anim, now);
};
