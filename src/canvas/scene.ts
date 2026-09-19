import { COLUMNS, ROWS, type Cell, type GameBoard, type Player, type WinningPiece } from '../constants';
import { selectShowKeyboardHints, type useGameStore } from '../store';
import { alpha, colors, game, mix } from '../theme';
import {
  cellCenter,
  type Layout,
} from './layout';
import {
  type AnimState,
  columnHoverAlpha,
  dropProgress,
  turnFlare,
  turnWeight,
  winPieceHighlightProgress,
  winPulseRing,
  winPulseScale,
} from './animations';

type GameState = ReturnType<typeof useGameStore.getState>;

// ───────────────────────── palette ─────────────────────────

/**
 * Canvas palette. Every entry resolves to a Night Owl token via ../theme, so
 * the canvas and the DOM chrome in App.css draw from one source and can't
 * drift apart.
 */
const C = game;

const colorFor = (player: Player): string =>
  player === 1 ? C.p1 : C.p2;
const softColorFor = (player: Player): string =>
  player === 1 ? C.p1Soft : C.p2Soft;

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
  grad.addColorStop(0, C.bgCenter);
  grad.addColorStop(1, C.bgEdge);

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
      grad.addColorStop(0, alpha(colors.background.floor, 0));
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

      // NB: the pulse ring is NOT drawn here. It expands to 1.6x the piece
      // radius, and pieceRadius === holeRadius, so drawing it in this pass
      // put 60% of its travel underneath the board face painted in step 6.
      // It gets its own pass after the face — see drawWinPulseRings.

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
        winnerGradient.addColorStop(0, C.winnerCore);
        winnerGradient.addColorStop(0.75, C.winnerMid);
        winnerGradient.addColorStop(1, C.winnerEdge);

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

/**
 * Expanding pulse rings around each fully-highlighted winning piece.
 *
 * Drawn in its own pass *after* the board face rather than with the pieces:
 * the ring grows to 1.6x the piece radius, and a piece is exactly the size
 * of its hole, so anything past the first instant of the animation is hidden
 * behind the face if it's painted with the pieces. The rings are a highlight
 * effect on top of the board, not something seen through a slot.
 *
 * Mirrors the gating in drawPiecesForBoard: a ring only appears once its
 * piece has finished dropping and finished its fade-to-white.
 */
const drawWinPulseRings = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  winningPieces: ReadonlyArray<WinningPiece>,
  anim: AnimState,
  now: number,
): void => {
  if (winningPieces.length === 0) return;

  const ring = winPulseRing(now);
  if (ring.alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = ring.alpha;
  ctx.strokeStyle = C.winnerRing;
  ctx.lineWidth = layout.cell.size * 0.06;

  winningPieces.forEach((piece, idx) => {
    const dropP = dropProgress(anim, piece.column, piece.row, now);
    const highlightP = winPieceHighlightProgress(anim, idx, now);
    if (dropP < 1 || highlightP < 1) return;

    const c = cellCenter(layout, piece.column, piece.row);
    circlePath(ctx, c.x, c.y, layout.cell.pieceRadius * ring.radiusFactor);
    ctx.stroke();
  });

  ctx.restore();
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
  grad.addColorStop(0, C.faceTop);
  grad.addColorStop(0.55, C.faceMid);
  grad.addColorStop(1, C.faceBottom);
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
  ctx.strokeStyle = C.archHighlight;
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

  ctx.fillStyle = C.feet;

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

/**
 * The row a piece dropped into `col` would land in — the lowest empty cell.
 * -1 when the column is full.
 */
const landingRow = (column: ReadonlyArray<Cell>): number => {
  const firstNonZero = column.findIndex((v) => v !== 0);
  return firstNonZero === -1 ? ROWS - 1 : firstNonZero - 1;
};

/**
 * True when the human is entitled to a hover preview at all. Nothing is
 * previewed on the AI's turn — the player can't act, so a ghost would lie.
 */
const hoverAllowed = (state: GameState): boolean => {
  if (!state.isPlaying) return false;
  return !(state.aiPlayer !== null && state.currentPlayer === state.aiPlayer);
};

/**
 * Columns with a live hover weight this frame: the one under the pointer
 * easing in, plus the one it just left easing out. Usually 0 or 1 entries,
 * briefly 2 mid-slide.
 */
const hoveredColumns = (
  anim: AnimState,
  now: number,
): Array<{ col: number; weight: number }> => {
  const out: Array<{ col: number; weight: number }> = [];
  for (const col of [anim.hoveredColumn, anim.prevHoveredColumn]) {
    if (col === null) continue;
    const weight = columnHoverAlpha(anim, col, now);
    if (weight > 0.01) out.push({ col, weight });
  }
  return out;
};

/**
 * Light pooling inside the empty slots of the hovered column. Painted BEHIND
 * the yellow face, so the board's own hole cutouts shape it — the highlight
 * reads as seven lit cavities down a channel rather than a rectangle laid
 * over the board.
 *
 * Each slot gets a radial that peaks at the centre and reaches zero by the
 * hole edge, leaving the back-shadow's dark rim intact so the cell keeps its
 * depth. Brightness ramps toward the landing row, tracing the path the piece
 * would actually take.
 */
const drawColumnGlow = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
  now: number,
): void => {
  if (!hoverAllowed(state)) return;
  const active = hoveredColumns(anim, now);
  if (active.length === 0) return;

  const { cell } = layout;
  // Full-strength player colour, not the softened piece tint: at these
  // alphas a desaturated mix just reads as grey dust against the dark hole.
  const tint = colorFor(state.currentPlayer);

  ctx.save();
  // Additive: the slot backs are near-black, so blending *adds* light to the
  // cavity instead of laying a flat film over it. Keeps the colour reading as
  // colour at alphas low enough to leave the shadowed rim intact.
  ctx.globalCompositeOperation = 'lighter';
  for (const { col, weight } of active) {
    const land = landingRow(state.gameBoard[col]);
    if (land < 0) continue; // full column — no channel to light

    for (let row = 0; row <= land; row++) {
      // 0 at the top of the open channel → 1 at the landing slot.
      const depth = land === 0 ? 1 : row / land;
      const peak = (0.30 + 0.24 * depth * depth) * weight;

      const c = cellCenter(layout, col, row);
      const grad = ctx.createRadialGradient(
        c.x,
        c.y,
        0,
        c.x,
        c.y,
        cell.holeRadius,
      );
      grad.addColorStop(0, alpha(tint, peak));
      grad.addColorStop(0.55, alpha(tint, peak * 0.7));
      grad.addColorStop(1, alpha(tint, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, cell.holeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};

/**
 * Ghost piece sitting in the slot the move would fill, plus a soft halo that
 * bleeds onto the surrounding yellow. Painted AFTER the face so it sits in
 * the hole the way a real piece does.
 */
const drawHoverGhost = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
  now: number,
): void => {
  if (!hoverAllowed(state)) return;
  const active = hoveredColumns(anim, now);
  if (active.length === 0) return;

  const { cell } = layout;
  const tint = softColorFor(state.currentPlayer);

  ctx.save();
  for (const { col, weight } of active) {
    const land = landingRow(state.gameBoard[col]);
    if (land < 0) continue;
    const c = cellCenter(layout, col, land);

    // Halo: reaches just past the hole rim so the highlight doesn't stop on
    // a hard circular edge.
    const halo = ctx.createRadialGradient(
      c.x,
      c.y,
      cell.pieceRadius * 0.6,
      c.x,
      c.y,
      cell.glowRadius * 1.5,
    );
    halo.addColorStop(0, alpha(tint, 0.22 * weight));
    halo.addColorStop(1, alpha(tint, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(c.x, c.y, cell.glowRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.55 * weight;
    ctx.fillStyle = tint;
    circlePath(ctx, c.x, c.y, cell.pieceRadius);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
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

/**
 * The two clock cards, with the active one lit. Which player is "up" is
 * carried by a per-player 0..1 weight rather than a boolean, so a turn change
 * cross-fades both cards at once: the outgoing card settles back down as the
 * incoming one rises, takes its colour, and grows its stripe.
 */
const drawClocks = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
  now: number,
): void => {
  const { clocks, scale } = layout;
  const times: [number, number] = [state.playerOneTime, state.playerTwoTime];
  const flare = state.isPlaying ? turnFlare(anim, now) : 0;

  for (let i = 0; i < 2; i++) {
    const player = (i + 1) as Player;
    const tint = colorFor(player);
    // 1 = fully "your turn", 0 = idle. Everything below reads off this.
    const w = state.isPlaying
      ? turnWeight(anim, player, state.currentPlayer, now)
      : 0;
    const cx = clocks.centers[i];
    const cardX = cx - clocks.cardWidth / 2;
    const cardCy = clocks.top + clocks.cardHeight / 2;

    ctx.save();
    // Lift + a touch of scale as the turn arrives, so the active card comes
    // forward rather than merely changing colour.
    ctx.translate(cx, cardCy);
    ctx.scale(1 + 0.022 * w, 1 + 0.022 * w);
    ctx.translate(-cx, -cardCy - 3 * scale * w);

    const cardPath = () =>
      roundedRectPath(
        ctx,
        cardX,
        clocks.top,
        clocks.cardWidth,
        clocks.cardHeight,
        clocks.cardRadius,
      );

    // Base card, then the active fill layered over it at the turn weight.
    // Both tokens carry their own alpha, so cross-fading by painting twice
    // beats trying to interpolate two rgba strings.
    cardPath();
    ctx.fillStyle = C.clockBg;
    ctx.fill();
    if (w > 0.01) {
      ctx.globalAlpha = w;
      cardPath();
      ctx.fillStyle = C.clockBgActive;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Hand-off bloom: a soft outline in the player's colour that flares as
    // the turn lands and is gone by the time they're actually thinking.
    if (w > 0.01 && flare > 0.01) {
      ctx.save();
      ctx.shadowColor = alpha(tint, 0.9);
      ctx.shadowBlur = 18 * scale * flare;
      ctx.strokeStyle = alpha(tint, 0.55 * flare * w);
      ctx.lineWidth = 1.5 * scale;
      cardPath();
      ctx.stroke();
      ctx.restore();
    }

    // Side stripe, grown from the card's vertical centre so the turn reads as
    // a baton being handed over rather than a light switching on.
    if (w > 0.01) {
      const stripeWidth = 4 * scale;
      const stripeHeight = (clocks.cardHeight - 16 * scale) * w;
      ctx.fillStyle = tint;
      roundedRectPath(
        ctx,
        cardX,
        cardCy - stripeHeight / 2,
        stripeWidth,
        stripeHeight,
        Math.min(stripeWidth / 2, stripeHeight / 2),
      );
      ctx.fill();
    }

    // Label - append "(CPU)" so it's clear who's the AI. Warms toward the
    // player's colour as their turn arrives.
    const isAi = state.aiPlayer === player;
    ctx.fillStyle = mix(C.textOnBg, tint, 0.7 * w);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `600 ${11 * scale}px ${FONT_UI}`;
    ctx.fillText(
      isAi ? `PLAYER ${player} (CPU)` : `PLAYER ${player}`,
      cx,
      clocks.top + 14 * scale,
    );

    // Time value, formatted M:SS. The idle clock dims back so the one
    // actually counting down is unmistakable.
    ctx.globalAlpha = 0.62 + 0.38 * w;
    ctx.fillStyle = C.textOnBg;
    ctx.font = `${34 * scale}px ${FONT_MONO}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(formatTime(times[i]), cx, clocks.top + clocks.cardHeight / 2 + 8 * scale);

    ctx.restore();
  }
};

/** The turn indicator's label for a given player. */
const turnLabelFor = (state: GameState, player: Player): string => {
  const suffix = state.aiPlayer === player ? ' (CPU)' : '';
  return state.isPlaying
    ? `Player ${player}${suffix}'s turn`
    : `Player ${player}${suffix}`;
};

/**
 * Minimalist turn indicator used when timers are off. Centered in the band
 * where the clocks would otherwise live - a single colored disc + the active
 * player's label.
 *
 * On a turn change the disc cross-fades to the new colour and sheds an
 * expanding ring, while the outgoing label slides up and out and the incoming
 * one rises into its place. With no clocks to carry the state, this band is
 * the only thing saying whose move it is, so the change has to be legible.
 */
const drawTurnIndicator = (
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  state: GameState,
  anim: AnimState,
  now: number,
): void => {
  const { clocks, scale } = layout;
  const cx = layout.width / 2;
  const cy = clocks.top + clocks.cardHeight / 2;

  const player = state.currentPlayer;
  const outgoing = anim.prevPlayer;
  const t = state.isPlaying ? turnWeight(anim, player, player, now) : 1;
  const flare = state.isPlaying ? turnFlare(anim, now) : 0;
  const radius = 18 * scale;
  const discX = cx - 90 * scale;

  // Ring shed by the disc at the moment of hand-off.
  if (flare > 0.01) {
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - flare);
    ctx.strokeStyle = colorFor(player);
    ctx.lineWidth = 2.5 * scale;
    circlePath(ctx, discX, cy, radius * (1 + 1.1 * flare));
    ctx.stroke();
    ctx.restore();
  }

  // Disc: outgoing colour underneath, incoming painted over it at the switch
  // weight, so the two hues blend through instead of swapping on one frame.
  if (outgoing !== null && t < 1) {
    circlePath(ctx, discX, cy, radius);
    ctx.fillStyle = colorFor(outgoing);
    ctx.fill();
  }
  ctx.save();
  ctx.globalAlpha = outgoing === null ? 1 : t;
  circlePath(ctx, discX, cy, radius);
  ctx.fillStyle = colorFor(player);
  ctx.fill();
  ctx.restore();

  // Thin outline for legibility on the blue background.
  circlePath(ctx, discX, cy, radius);
  ctx.lineWidth = 2 * scale;
  ctx.strokeStyle = C.discOutline;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${22 * scale}px ${FONT_UI}`;
  const labelX = cx - 60 * scale;
  const travel = 14 * scale;

  ctx.save();
  // Outgoing label continues upward and fades; incoming rises to meet the
  // baseline.
  if (outgoing !== null && t < 1) {
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = C.textOnBg;
    ctx.fillText(turnLabelFor(state, outgoing), labelX, cy - travel * t);
  }
  ctx.globalAlpha = outgoing === null ? 1 : t;
  ctx.fillStyle = C.textOnBg;
  ctx.fillText(turnLabelFor(state, player), labelX, cy + travel * (1 - t));
  ctx.restore();
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
  ctx.fillStyle = hovered ? C.btnFill : C.menuFill;
  ctx.fill();
  ctx.lineWidth = 1 * s;
  ctx.strokeStyle = hovered ? C.btnFill : C.menuBorder;
  ctx.stroke();

  ctx.fillStyle = hovered ? C.btnText : C.textOnBg;
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
    ctx.fillStyle = C.kbdFill;
    ctx.fill();
    // Slightly darker bottom edge to fake the "physical key" feel.
    ctx.lineWidth = 1 * s;
    ctx.strokeStyle = C.kbdBorder;
    ctx.stroke();

    ctx.fillStyle = C.textOnBg;
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
  ctx.fillStyle = C.textOnBg;
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
  ctx.fillStyle = C.hintText;
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

  ctx.fillStyle = C.title;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Poppins 800 ExtraBold mimics the chunky display weight of the previous
  // Lilita One choice without needing a separate font file.
  ctx.font = `800 ${36 * scale}px ${FONT_DISPLAY}`;
  ctx.fillText('CONNECT4', cx, cy);
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
  drawWinPulseRings(ctx, layout, view.winningPieces, anim, now);
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

  // 2. Top band: clocks, or the turn indicator when timers are off. The
  //    result card is a DOM overlay now (see .result in App.css), so the band
  //    is no longer contested and the final clocks stay up after the game
  //    ends. With timers off there's nothing worth showing once it's over —
  //    whose turn it is stops being a fact.
  if (state.timersEnabled) {
    drawClocks(ctx, layout, state, anim, now);
  } else if (!state.showOverlay) {
    drawTurnIndicator(ctx, layout, state, anim, now);
  }

  // 3. Hole back-shadows. Painted on the background BEFORE pieces so that:
  //    - empty cells: the shadow shows through the hole cutout below
  //      and gives the slot real depth.
  //    - occupied cells: the opaque piece in step 4 covers the shadow.
  drawHoleBackShadows(ctx, layout);

  // 3b. Hover glow, painted on the hole backs so the board face in step 6
  //     masks it into the hole shapes — a lit channel, not a rectangle.
  if (!state.showOverlay) {
    drawColumnGlow(ctx, layout, state, anim, now);
  }

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

  // 7b. Win pulse rings. Must come after the face: they expand past the hole
  //     they belong to, so painting them with the pieces would clip them.
  drawWinPulseRings(ctx, layout, state.winningPieces, anim, now);

  // 8. Column key hints — "1" through "7" above each column. Shown only
  //    while the game is live (a true hint applies only when input matters)
  //    and the user has the keyboard-hints toggle on. Suppressed entirely
  //    on touch / narrow viewports via `selectShowKeyboardHints`.
  const showHints = selectShowKeyboardHints(state);
  if (showHints && state.gamePhase === 'playing' && !state.showOverlay) {
    drawColumnKeyHints(ctx, layout);
  }

  // 9. Hover ghost piece + halo. Drawn after the board face so the ghost
  //    appears INSIDE the target hole, like a settled piece would.
  //    Suppressed during the end-banner / win sequence.
  if (!state.showOverlay) {
    drawHoverGhost(ctx, layout, state, anim, now);
  }

  // 10. "CONNECT4" title.
  drawBoardTitle(ctx, layout);

  // 11. In-game MENU button (top-right). Hidden once the win/draw banner
  //     is up — that banner has its own Menu button. The Esc-kbd hint chip
  //     below it shows only when the user has keyboard hints enabled.
  if (!state.showOverlay && state.gamePhase === 'playing') {
    drawMenuButton(ctx, layout, anim, showHints);
  }

  // 12. AI "thinking" pulse, layered above the board but below the banner.
  if (state.aiThinking) {
    drawThinkingIndicator(ctx, layout, now);
  }
};
