import { COLUMNS, ROWS, type Cell, type Player, type WinningPiece } from '../constants';
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
  pieceBlack: '#34495e',
  pieceBlackSoft: '#757575',
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

const drawPieces = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
  now: number,
): void => {
  const startY = dropStartY(layout);

  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const cellValue: Cell = state.gameBoard[col][row];
      if (cellValue === 0) continue;

      const finalCenter = cellCenter(layout, col, row);
      const progress = dropProgress(anim, col, row, now);
      const y = startY + (finalCenter.y - startY) * progress;
      const isWinner = isWinningPiece(state.winningPieces, col, row);

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

// ───────────────────────── clocks ─────────────────────────

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

    // Label.
    ctx.fillStyle = C.textOnBlue;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${12 * scale}px system-ui, sans-serif`;
    ctx.fillText(`PLAYER ${player} TIME`, cx, clocks.top + 14 * scale);

    // Time value.
    ctx.font = `${36 * scale}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(String(times[i]), cx, clocks.top + clocks.cardHeight / 2 + 8 * scale);
  }
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
  ctx.fillText('Reset', btn.x + btn.width / 2, btn.y + btn.height / 2 + 1);

  ctx.restore();
};

// ───────────────────────── paint ─────────────────────────

export const paint = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
  now: number,
): void => {
  // 1. Background.
  ctx.fillStyle = C.boardBlue;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // 2. Clocks (drawn before the board, in the band above it).
  drawClocks(ctx, layout, state);

  // 3. Pieces — drawn in their current positions (some may be above the
  //    board area mid-drop; those will remain visible since the yellow board
  //    layer only covers the rectangle below).
  drawPieces(ctx, layout, state, anim, now);

  // 4. Yellow board face with circular holes. Pieces in step 3 show through
  //    the holes; the rest is covered by yellow.
  drawBoardWithHoles(ctx, layout);

  // 5. Hover indicator + ghost piece. Drawn after the board so the ghost
  //    appears INSIDE the appropriate hole and the column tint sits on top
  //    of the yellow band.
  drawHover(ctx, layout, state, anim);

  // 6. "CONNECT4" title.
  drawBoardTitle(ctx, layout);

  // 7. End-of-game overlay.
  drawOverlay(ctx, layout, state, anim, now);
};
