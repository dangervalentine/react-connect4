import { COLUMNS, ROWS, type Cell, type GameBoard, type Player, type WinningPiece } from '../constants';
import type { useGameStore } from '../store';
import {
  cellCenter,
  type Layout,
} from './layout';
import {
  type AnimState,
  dropProgress,
  overlayCardProgress,
  winPieceHighlightProgress,
  winPulseRing,
  winPulseScale,
} from './animations';

type GameState = ReturnType<typeof useGameStore.getState>;

// ───────────────────────── palette ─────────────────────────

const C = {
  // Blue family — split into a 3-stop tonal ramp so the canvas can carry a
  // subtle vignette without the board itself losing its iconic mid-blue.
  boardBlue: '#1565c0',
  boardBlueLight: '#1d75d4', // vignette center
  boardBlueDark: '#0b3f8c',  // vignette edges, support feet, deep hole back

  // Yellow family — vertical gradient on the board face for a faint plastic
  // sheen. Edges are deliberately narrow so the board reads as one color at a
  // glance and the gradient is something you only notice if you look for it.
  boardYellow: '#fbc02d',
  boardYellowLight: '#fdd54b',
  boardYellowDark: '#f1a917',

  pieceRed: '#f44336',
  pieceRedSoft: '#e57373',
  pieceBlack: '#1a1a1a',
  pieceBlackSoft: '#4a4a4a',
  pieceWinner: '#ffffff',

  // Hairline ring drawn around each piece to suggest a moulded edge — Hasbro
  // chips have a thin lip you can feel with a thumbnail.
  pieceEmboss: 'rgba(0, 0, 0, 0.32)',
  // Specular dot for the glossy plastic highlight. Kept partially transparent
  // so it tints toward the piece's underlying color rather than reading pure
  // white.
  pieceSpecular: 'rgba(255, 255, 255, 0.55)',

  // Hole interior — a soft radial dark, painted before pieces, that survives
  // when a slot is empty and gives the holes visible depth.
  holeBack: 'rgba(0, 0, 0, 0.45)',
  // Inner shadow ring drawn just inside each hole, on the yellow face, to
  // suggest the rim of a slot — like a millimeter of bevel.
  holeRim: 'rgba(140, 90, 0, 0.55)',

  // Highlight stroke along the top arch — fakes a light coming from above.
  topArchHighlight: 'rgba(255, 255, 255, 0.28)',

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

/*
 * Font stacks for canvas-painted text. Poppins handles the display title
 * (chunky, geometric); Inter handles all other UI text (labels, buttons,
 * banner messages). Both come from Google Fonts via the <link> in
 * index.html; system-ui stays in the stack as a fallback during the
 * font-display:swap window or if the network fetch fails.
 */
const FONT_DISPLAY = '"Poppins", system-ui, -apple-system, sans-serif';
const FONT_UI = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

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

// ───────────────────────── background vignette ─────────────────────────

/**
 * Radial vignette over the whole canvas: lighter in the middle, darker at the
 * corners. Replaces the previous flat-fill background so the board sits on
 * something rather than floating against a single tone of blue.
 */
const drawBackground = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const cx = layout.width / 2;
  const cy = layout.height / 2;
  // Reach to a corner — this is the "outer ring" radius. Using the corner
  // distance means the darkening lands at the canvas edges rather than
  // partway in, which would look like a halo.
  const outer = Math.hypot(layout.width, layout.height) / 2;

  const grad = ctx.createRadialGradient(cx, cy, outer * 0.15, cx, cy, outer);
  grad.addColorStop(0, C.boardBlueLight);
  grad.addColorStop(1, C.boardBlueDark);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, layout.width, layout.height);
};

// ───────────────────────── pieces ─────────────────────────

/** Where the falling piece visually starts (well above the board). */
const dropStartY = (layout: Layout): number =>
  layout.board.y - layout.cell.size * 1.5;

/**
 * Paint a soft dark vignette at each cell position. Drawn between the canvas
 * background and the pieces so:
 *   - empty cells: this shadow shows through the hole cutout, giving the slot
 *     visible depth.
 *   - occupied cells: the opaque piece covers the shadow.
 *
 * The radial fade keeps the cell back from looking like a flat black disc —
 * the darkness pools at the hole's edge, matching how light wraps into a real
 * recessed cavity.
 */
const drawHoleBackShadows = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { cell } = layout;
  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const c = cellCenter(layout, col, row);
      const grad = ctx.createRadialGradient(
        c.x,
        c.y,
        cell.holeRadius * 0.35,
        c.x,
        c.y,
        cell.holeRadius,
      );
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, C.holeBack);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cell.holeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

/** Find the position of (col,row) inside the winning-pieces array, or -1. */
const winnerIndexOf = (
  winningPieces: ReadonlyArray<WinningPiece>,
  col: number,
  row: number,
): number => winningPieces.findIndex((p) => p.column === col && p.row === row);

/**
 * Draw all pieces for the given board. Board-agnostic so the attract path can
 * paint a separate self-play game without going through the store.
 *
 * Winning pieces are highlighted with a staggered fade-to-white based on
 * `anim.winSequenceStartedAt`. Each piece's highlight progress is computed
 * from its index in `winningPieces`, so pieces light up *in array order*.
 * The pulse ring + winPulseScale only kick in once a given piece is fully
 * highlighted (progress >= 1) AND its drop animation has finished.
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
      const dropP = dropProgress(anim, col, row, now);
      const y = startY + (finalCenter.y - startY) * dropP;

      const winnerIdx = winnerIndexOf(winningPieces, col, row);
      const isWinner = winnerIdx >= 0;
      const highlightP = isWinner
        ? winPieceHighlightProgress(anim, winnerIdx, now)
        : 0;
      const fullyHighlighted = isWinner && highlightP >= 1 && dropP >= 1;

      // Pulse ring under fully-highlighted pieces. Skipped while the piece
      // is still fading in or still in mid-drop.
      if (fullyHighlighted) {
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

      const scale = fullyHighlighted ? winPulseScale(now) : 1;
      const radius = layout.cell.pieceRadius * scale;
      const fill = colorFor(cellValue);

      // ── normal-color body ──
      //
      // Three-stop radial gradient with an off-center light source — reads as
      // glossy plastic rather than a flat circle. Always drawn (even for
      // winners) and then overlaid by the white winner gradient at alpha =
      // highlightP for the staggered fade-in.
      const gradient = ctx.createRadialGradient(
        finalCenter.x - radius * 0.35,
        y - radius * 0.35,
        radius * 0.05,
        finalCenter.x,
        y,
        radius,
      );
      gradient.addColorStop(0, softColorFor(cellValue));
      gradient.addColorStop(0.6, fill);
      gradient.addColorStop(1, fill);

      ctx.fillStyle = gradient;
      circlePath(ctx, finalCenter.x, y, radius);
      ctx.fill();

      // ── winner overlay (alpha = highlightP) ──
      //
      // Cross-fades from the normal-color body to a white-gloss body. At
      // progress 0 the piece looks normal; at 1 it's fully white. The drop
      // delay in App.tsx ensures highlightP stays at 0 until the winning
      // piece has finished falling.
      if (highlightP > 0) {
        const winnerGradient = ctx.createRadialGradient(
          finalCenter.x - radius * 0.35,
          y - radius * 0.35,
          radius * 0.05,
          finalCenter.x,
          y,
          radius,
        );
        winnerGradient.addColorStop(0, '#ffffff');
        winnerGradient.addColorStop(0.75, '#f5f5f5');
        winnerGradient.addColorStop(1, '#d8d8d8');

        ctx.save();
        ctx.globalAlpha = highlightP;
        ctx.fillStyle = winnerGradient;
        circlePath(ctx, finalCenter.x, y, radius);
        ctx.fill();
        ctx.restore();
      }

      // ── emboss ring ──
      //
      // Darker stroke around the edge mimics the moulded lip on plastic
      // chips. Fades out as the piece highlights — winners read better
      // with just the pulse ring outline.
      if (highlightP < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - highlightP;
        ctx.lineWidth = Math.max(1, 1.2 * layout.scale);
        ctx.strokeStyle = C.pieceEmboss;
        circlePath(ctx, finalCenter.x, y, radius - ctx.lineWidth / 2);
        ctx.stroke();
        ctx.restore();
      }

      // ── specular highlight ──
      //
      // Small bright tilted ellipse near the top-left. Keeps the glossy
      // look on both red/black and the post-highlight white state.
      ctx.save();
      ctx.translate(finalCenter.x - radius * 0.32, y - radius * 0.42);
      ctx.rotate(-Math.PI / 6);
      ctx.fillStyle = C.pieceSpecular;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 0.28, radius * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
};

// ───────────────────────── board (with holes) ─────────────────────────

/**
 * Build the outer board silhouette as a single closed path. Pulled out so the
 * column-divider pass can clip against the same shape without re-deriving it.
 */
const buildBoardSilhouette = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { board } = layout;
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
  // body right edge
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
  // body left edge
  ctx.lineTo(board.x, board.y + board.topArchHeight);
  ctx.quadraticCurveTo(board.x, board.y, board.x + board.topArchHeight, board.y);
  ctx.closePath();
};

/** Append the 42 hole circles as subpaths into the current ctx path. */
const appendHoleSubpaths = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { cell } = layout;
  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const c = cellCenter(layout, col, row);
      ctx.moveTo(c.x + cell.holeRadius, c.y);
      ctx.arc(c.x, c.y, cell.holeRadius, 0, Math.PI * 2);
    }
  }
};

const drawBoardWithHoles = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { board } = layout;

  // Single path: silhouette + 42 hole subpaths, filled with even-odd so the
  // holes punch through. Filled with a vertical gradient instead of a flat
  // color so the face reads as faintly reflective plastic rather than card.
  buildBoardSilhouette(ctx, layout);
  appendHoleSubpaths(ctx, layout);

  const grad = ctx.createLinearGradient(0, board.y, 0, board.y + board.height);
  grad.addColorStop(0, C.boardYellowLight);
  grad.addColorStop(0.55, C.boardYellow);
  grad.addColorStop(1, C.boardYellowDark);
  ctx.fillStyle = grad;
  ctx.fill('evenodd');
};

/**
 * Soft dark ring around each hole, painted on the yellow face just outside
 * the hole boundary. Reads as the bevel/chamfer at the rim of a moulded slot.
 * Stroking at `holeRadius + lineWidth/2` keeps the whole stroke on the yellow
 * side rather than bleeding into the hole interior over the piece.
 */
const drawHoleRims = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { cell } = layout;
  const lineWidth = Math.max(1, 1.5 * layout.scale);
  ctx.strokeStyle = C.holeRim;
  ctx.lineWidth = lineWidth;
  const ringRadius = cell.holeRadius + lineWidth / 2;
  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const c = cellCenter(layout, col, row);
      ctx.beginPath();
      ctx.arc(c.x, c.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
};

/**
 * Highlight stroke along the upper arch and a touch of the upper side edges.
 * Fakes a soft overhead light source — the same axis as the piece highlights.
 */
const drawTopArchHighlight = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { board, scale } = layout;

  ctx.save();
  ctx.strokeStyle = C.topArchHighlight;
  ctx.lineWidth = Math.max(1.5, 2.5 * scale);
  ctx.lineCap = 'round';

  ctx.beginPath();
  // Left curve up, across the top, right curve down — slightly inset from the
  // outline so the stroke sits on the yellow rather than half-off the edge.
  const inset = ctx.lineWidth / 2;
  ctx.moveTo(board.x + inset, board.y + board.topArchHeight);
  ctx.quadraticCurveTo(
    board.x + inset,
    board.y + inset,
    board.x + board.topArchHeight,
    board.y + inset,
  );
  ctx.lineTo(board.x + board.width - board.topArchHeight, board.y + inset);
  ctx.quadraticCurveTo(
    board.x + board.width - inset,
    board.y + inset,
    board.x + board.width - inset,
    board.y + board.topArchHeight,
  );
  ctx.stroke();
  ctx.restore();
};

/**
 * Two splayed support feet drawn under the bottom arch — the unmistakable
 * silhouette of the Hasbro toy. Painted in the deep-blue back tone so they
 * read as the back plastic of the stand sticking out below the yellow face.
 */
const drawBoardFeet = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { board, scale } = layout;

  const footHeight = 14 * scale;
  // Top of the foot tucks under the bottom arch so there's no visible seam.
  const topY = board.bodyTop + board.bodyHeight + board.bottomArchHeight - 2 * scale;
  const bottomY = topY + footHeight;

  // Inner edge of each foot is roughly under the cell at column 1 / column 5.
  // Outer edge is just outside the board silhouette so the foot reads as
  // "wider than the board at its base".
  const innerInset = 70 * scale;
  const outerOverhang = 6 * scale;
  // Outer-bottom is shifted further out than outer-top — that splay is what
  // sells the visual.
  const splay = 10 * scale;

  ctx.fillStyle = C.boardBlueDark;

  // ── left foot ──
  ctx.beginPath();
  ctx.moveTo(board.x + innerInset, topY);                    // top-inner
  ctx.lineTo(board.x - outerOverhang + splay * 0.4, topY);   // top-outer
  ctx.lineTo(board.x - outerOverhang, bottomY);              // bottom-outer
  ctx.lineTo(board.x + innerInset - splay, bottomY);         // bottom-inner
  ctx.closePath();
  ctx.fill();

  // ── right foot (mirror) ──
  const rightEdge = board.x + board.width;
  ctx.beginPath();
  ctx.moveTo(rightEdge - innerInset, topY);
  ctx.lineTo(rightEdge + outerOverhang - splay * 0.4, topY);
  ctx.lineTo(rightEdge + outerOverhang, bottomY);
  ctx.lineTo(rightEdge - innerInset + splay, bottomY);
  ctx.closePath();
  ctx.fill();
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
    ctx.font = `600 ${11 * scale}px ${FONT_UI}`;
    ctx.fillText(
      isAi ? `PLAYER ${player} (CPU)` : `PLAYER ${player}`,
      cx,
      clocks.top + 14 * scale,
    );

    // Time value, formatted M:SS.
    ctx.font = `${34 * scale}px ${FONT_MONO}`;
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
  ctx.font = `500 ${22 * scale}px ${FONT_UI}`;
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
  showKbdHint: boolean,
): void => {
  const b = layout.menuButton;
  const hovered = anim.menuHovered;
  const s = layout.scale;

  roundedRectPath(ctx, b.x, b.y, b.width, b.height, b.radius);
  ctx.fillStyle = hovered ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.18)';
  ctx.fill();
  ctx.lineWidth = 1 * s;
  ctx.strokeStyle = hovered ? C.boardBlue : 'rgba(255, 255, 255, 0.5)';
  ctx.stroke();

  ctx.fillStyle = hovered ? C.boardBlue : C.textOnBlue;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${11 * s}px ${FONT_UI}`;
  ctx.fillText('MENU', b.x + b.width / 2, b.y + b.height / 2 + 1);

  // Below the button: small kbd-style chip with "Esc" so keyboard users can
  // see the shortcut without hovering. Painted only when the user has the
  // keyboard hints toggle on. Sized + styled to match the DOM-side
  // <kbd> glyphs in the modal hint footers.
  if (showKbdHint) {
    const chipW = 38 * s;
    const chipH = 17 * s;
    const chipX = b.x + (b.width - chipW) / 2;
    const chipY = b.y + b.height + 6 * s;
    const chipR = 4 * s;

    roundedRectPath(ctx, chipX, chipY, chipW, chipH, chipR);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fill();
    // Slightly darker bottom edge to fake the "physical key" feel.
    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = 'rgba(20, 33, 61, 0.25)';
    ctx.stroke();

    ctx.fillStyle = '#14213d';
    ctx.font = `600 ${10 * s}px ${FONT_UI}`;
    ctx.fillText('Esc', chipX + chipW / 2, chipY + chipH / 2 + 1);
  }
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
  ctx.font = `500 ${13 * scale}px ${FONT_UI}`;
  ctx.fillText('CPU thinking…', cx, cy);
  ctx.restore();
};

// ───────────────────────── column key hints ─────────────────────────

/**
 * Paint the digit (1-7) above each column when keyboard hints are on, so
 * players know which number key drops a piece into which column. Sits in the
 * narrow gap between the clocks band and the board's top arch.
 */
const drawColumnKeyHints = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
): void => {
  const { board, cell, scale } = layout;

  // Position: just above the top arch of the board.
  const labelY = board.y - 6 * scale;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.font = `700 ${13 * scale}px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let col = 0; col < COLUMNS; col++) {
    const x = board.x + board.padding + (col + 0.5) * cell.size;
    ctx.fillText(String(col + 1), x, labelY);
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
  // Poppins 800 ExtraBold mimics the chunky display weight of the previous
  // Lilita One choice without needing a separate font file.
  ctx.font = `800 ${36 * scale}px ${FONT_DISPLAY}`;
  ctx.fillText('CONNECT4', cx, cy);
};

// ───────────────────────── end-of-game banner ─────────────────────────

/**
 * Slim banner painted in the clocks band when a game is over. Replaces the
 * old centered card so the board stays fully visible behind it (winning
 * pieces in particular). Contains the result on the left and a Menu button
 * on the right; no canvas-wide dim.
 *
 * Animates in via a fade + slight scale, reusing `overlayCardProgress`.
 */
const drawEndBanner = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
  now: number,
): void => {
  if (!state.showOverlay) return;

  const cardProgress = overlayCardProgress(anim, now);
  const card = layout.overlay.card;
  const cardCx = card.x + card.width / 2;
  const cardCy = card.y + card.height / 2;

  // Subtle fade-in + scale-up. No backdrop dim — we want the board
  // (especially the winning pieces) to stay readable underneath.
  const scaleAnim = 0.94 + 0.06 * cardProgress;
  ctx.save();
  ctx.globalAlpha = cardProgress;
  ctx.translate(cardCx, cardCy);
  ctx.scale(scaleAnim, scaleAnim);
  ctx.translate(-cardCx, -cardCy);

  // Banner body with a soft drop-shadow so it lifts off the canvas.
  ctx.save();
  ctx.shadowColor = C.cardShadow;
  ctx.shadowBlur = 18 * layout.scale;
  ctx.shadowOffsetY = 4 * layout.scale;
  roundedRectPath(ctx, card.x, card.y, card.width, card.height, card.radius);
  ctx.fillStyle = C.cardBg;
  ctx.fill();
  ctx.restore();

  // Left side: colored accent stripe in the winner's color (or neutral grey
  // for a draw) — quick visual anchor for who won.
  const stripeWidth = 6 * layout.scale;
  ctx.fillStyle = state.isDraw
    ? '#8b9ab0'
    : state.winner === 1
      ? C.pieceRed
      : C.pieceBlack;
  ctx.fillRect(
    card.x,
    card.y + 10 * layout.scale,
    stripeWidth,
    card.height - 20 * layout.scale,
  );

  // Message text — left-aligned next to the stripe.
  const message = state.isDraw
    ? "It's a draw"
    : `Player ${state.winner ?? state.currentPlayer} wins!`;
  ctx.fillStyle = C.textOnCard;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${22 * layout.scale}px ${FONT_UI}`;
  ctx.fillText(message, card.x + stripeWidth + 16 * layout.scale, cardCy);

  // Menu button on the right.
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
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${15 * layout.scale}px ${FONT_UI}`;
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
 * Slim paint path for setup mode. Mirrors the main `paint` render order
 * (background → hole shadows → pieces → feet → board → rim → dividers →
 * arch highlight → title) so the attract demo benefits from the same
 * material polish as the real game. Omits clocks, menu, hover, and the
 * end-game overlay — those don't apply during setup.
 */
export const paintAttract = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  view: AttractView,
  anim: AnimState,
  now: number,
): void => {
  drawBackground(ctx, layout);
  drawHoleBackShadows(ctx, layout);
  drawPiecesForBoard(ctx, layout, view.gameBoard, view.winningPieces, anim, now);
  drawBoardFeet(ctx, layout);
  drawBoardWithHoles(ctx, layout);
  drawHoleRims(ctx, layout);
  drawTopArchHighlight(ctx, layout);
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
  // 1. Background vignette — radial gradient so the corners darken and the
  //    middle stays bright. Replaces the previous flat fill.
  drawBackground(ctx, layout);

  // During the welcome modal we'd normally hand off to paintAttract; this
  // branch is the defensive fallback if paint() ever gets called in setup.
  if (state.gamePhase === 'setup') {
    drawHoleBackShadows(ctx, layout);
    drawBoardFeet(ctx, layout);
    drawBoardWithHoles(ctx, layout);
    drawHoleRims(ctx, layout);
    drawTopArchHighlight(ctx, layout);
    drawBoardTitle(ctx, layout);
    return;
  }

  // 2. Top band: clocks / turn indicator OR the end-of-game banner. The
  //    banner only takes over once `showOverlay` is set (after the win
  //    sequence completes); during the sequence pause the clocks stay visible
  //    so the player sees the final times alongside the highlight animation.
  if (state.showOverlay) {
    // Don't paint clocks during the banner — banner sits in their space.
  } else if (state.timersEnabled) {
    drawClocks(ctx, layout, state);
  } else {
    drawTurnIndicator(ctx, layout, state);
  }

  // 3. Hole back-shadows. Painted on the background BEFORE pieces so that:
  //    - empty cells: the shadow shows through the hole cutout below
  //      and gives the slot real depth.
  //    - occupied cells: the opaque piece in step 4 covers the shadow.
  drawHoleBackShadows(ctx, layout);

  // 4. Pieces. Mid-drop pieces appear above the board area; they remain
  //    visible since the yellow face in step 6 only covers the rectangle
  //    below + cuts holes through which settled pieces show. Winning pieces
  //    fade to white in staggered order based on anim.winSequenceStartedAt.
  drawPiecesForBoard(ctx, layout, state.gameBoard, state.winningPieces, anim, now);

  // 5. Support feet — drawn before the yellow face so the bottom-arch
  //    silhouette overlaps cleanly, hiding any seam.
  drawBoardFeet(ctx, layout);

  // 6. Yellow board face with circular holes. Pieces in step 4 show through
  //    the holes; everything else is covered by the yellow gradient.
  drawBoardWithHoles(ctx, layout);

  // 7. Hole rims + top-arch highlight — micro-details that read as "the
  //    board has texture" rather than as visible elements. All clipped or
  //    positioned to sit on the yellow.
  drawHoleRims(ctx, layout);
  drawTopArchHighlight(ctx, layout);

  // 8. Column key hints — "1" through "7" above each column. Shown only
  //    while the game is live (a true hint applies only when input matters)
  //    and the user has the keyboard-hints toggle on.
  if (state.keyboardHintsVisible && state.gamePhase === 'playing' && !state.showOverlay) {
    drawColumnKeyHints(ctx, layout);
  }

  // 9. Hover indicator + ghost piece. Drawn after the board so the ghost
  //    appears INSIDE the appropriate hole and the column tint sits on top
  //    of the yellow band. Suppressed during the end-banner / win sequence.
  if (!state.showOverlay) {
    drawHover(ctx, layout, state, anim);
  }

  // 10. "CONNECT4" title.
  drawBoardTitle(ctx, layout);

  // 11. In-game MENU button (top-right). Hidden once the win/draw banner
  //     is up — that banner has its own Menu button. The Esc-kbd hint chip
  //     below it shows only when the user has keyboard hints enabled.
  if (!state.showOverlay && state.gamePhase === 'playing') {
    drawMenuButton(ctx, layout, anim, state.keyboardHintsVisible);
  }

  // 12. AI "thinking" pulse, layered above the board but below the banner.
  if (state.aiThinking) {
    drawThinkingIndicator(ctx, layout, now);
  }

  // 13. End-of-game banner. Sits in the clocks band; doesn't cover the board.
  drawEndBanner(ctx, layout, state, anim, now);
};
