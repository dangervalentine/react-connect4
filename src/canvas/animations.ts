/**
 * Mutable animation state held outside React. Updated by store subscribers
 * and input handlers, read by the paint function on every frame.
 */
export type AnimState = {
  /** "col,row" → performance.now() when the drop started. */
  drops: Map<string, number>;
  /** Column the pointer is currently over, or null. */
  hoveredColumn: number | null;
  /** True while the pointer is over the win/draw overlay's Reset button. */
  resetHovered: boolean;
  /** True while the pointer is over the in-game MENU button (top-right). */
  menuHovered: boolean;
  /** performance.now() when the win/draw overlay first appeared, or null. */
  overlayShownAt: number | null;
  /**
   * performance.now() when the game-end sequence started (winning move was
   * played, or the board filled into a draw). Drives the staggered per-piece
   * highlight that runs BEFORE the overlay banner is revealed.
   */
  winSequenceStartedAt: number | null;
};

export const createAnimState = (): AnimState => ({
  drops: new Map(),
  hoveredColumn: null,
  resetHovered: false,
  menuHovered: false,
  overlayShownAt: null,
  winSequenceStartedAt: null,
});

export const cellKey = (col: number, row: number): string => `${col},${row}`;

// ───────────────────────── easing ─────────────────────────

/** Clamp a number to [0, 1]. */
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Drop curve: quadratic gravity for the first 55% of the duration, then two
 * exponentially-damped settle bounces. Output is the *progress* along the
 * piece's travel from its start position to its final cell — values can
 * briefly dip below 1 during a bounce (piece momentarily lifted), but never
 * above 1.
 */
export const easeDropBounce = (t: number): number => {
  const u = clamp01(t);
  if (u >= 1) return 1;

  if (u < 0.55) {
    const local = u / 0.55;
    return local * local;
  }

  const settle = (u - 0.55) / 0.45; // 0 → 1
  const damping = Math.exp(-settle * 4);
  return 1 - damping * 0.07 * Math.abs(Math.sin(settle * Math.PI * 2.5));
};

/** Strong ease-out, mimics CSS cubic-bezier(0.16, 1, 0.3, 1). */
export const easeOutExpo = (t: number): number => {
  const u = clamp01(t);
  return u === 1 ? 1 : 1 - Math.pow(2, -10 * u);
};

/** Standard ease-out. */
export const easeOutCubic = (t: number): number => {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 3);
};

// ───────────────────────── durations ─────────────────────────

export const DROP_DURATION_MS = 500;
export const OVERLAY_CARD_MS = 320;
/** One full pulse cycle of a winning piece. */
export const WIN_PULSE_PERIOD_MS = 1400;

/**
 * Game-end "savor the moment" timing. When the winning move lands we want to
 * let the player see the result before the menu banner appears:
 *
 *   1. Winning pieces light up one by one (`WIN_HIGHLIGHT_STAGGER_MS` apart),
 *      each piece fading from its normal color to white over
 *      `WIN_HIGHLIGHT_FADE_MS`.
 *   2. After the last piece has finished fading, we hold the position for
 *      `WIN_HIGHLIGHT_HOLD_MS` so the result sinks in.
 *   3. Then the top banner with the result + Menu button fades in.
 *
 * For a draw there's nothing to highlight, so step 1 collapses and we just
 * use the hold delay before showing the banner.
 */
export const WIN_HIGHLIGHT_STAGGER_MS = 180;
export const WIN_HIGHLIGHT_FADE_MS = 220;
export const WIN_HIGHLIGHT_HOLD_MS = 900;

/**
 * Total time between a game ending and the menu banner appearing. For wins,
 * accounts for the per-piece stagger + fade + hold; for draws just the hold.
 */
export const winSequenceDuration = (numWinningPieces: number): number => {
  if (numWinningPieces <= 0) return WIN_HIGHLIGHT_HOLD_MS;
  const lastPieceStartsAt = (numWinningPieces - 1) * WIN_HIGHLIGHT_STAGGER_MS;
  return lastPieceStartsAt + WIN_HIGHLIGHT_FADE_MS + WIN_HIGHLIGHT_HOLD_MS;
};

/**
 * Per-piece progress (0..1) for the staggered win highlight. Returns 1 if
 * the sequence hasn't started yet (i.e. game is in progress and the piece
 * is just a regular piece — no winner status). Pieces highlight in the
 * order they appear in the winningPieces array.
 */
export const winPieceHighlightProgress = (
  anim: AnimState,
  winnerIndex: number,
  now: number,
): number => {
  if (anim.winSequenceStartedAt === null) return 0;
  const elapsed = now - anim.winSequenceStartedAt - winnerIndex * WIN_HIGHLIGHT_STAGGER_MS;
  if (elapsed <= 0) return 0;
  if (elapsed >= WIN_HIGHLIGHT_FADE_MS) return 1;
  return easeOutCubic(elapsed / WIN_HIGHLIGHT_FADE_MS);
};

// ───────────────────────── computed values ─────────────────────────

/** Progress of a drop animation, 0..1. Returns 1 if no animation is recorded. */
export const dropProgress = (
  anim: AnimState,
  col: number,
  row: number,
  now: number,
): number => {
  const startedAt = anim.drops.get(cellKey(col, row));
  if (startedAt === undefined) return 1;
  return easeDropBounce((now - startedAt) / DROP_DURATION_MS);
};

/** Scale factor for a winning piece's pulse, oscillating 1.0..1.06. */
export const winPulseScale = (now: number): number => {
  const phase = ((now % WIN_PULSE_PERIOD_MS) / WIN_PULSE_PERIOD_MS) * Math.PI * 2;
  // (1 + sin) goes 0..2 → halve → 0..1 → scale to 0..0.06
  return 1 + 0.03 * (1 + Math.sin(phase));
};

/** Radius + alpha for the win pulse glow ring (expanding-and-fading). */
export const winPulseRing = (
  now: number,
): { radiusFactor: number; alpha: number } => {
  const phase = (now % WIN_PULSE_PERIOD_MS) / WIN_PULSE_PERIOD_MS;
  return {
    radiusFactor: 1 + phase * 0.6, // 1.0 → 1.6× cell radius
    alpha: 0.55 * (1 - phase),
  };
};

/** Card progress 0..1 (used for scale + opacity of the win/draw card). */
export const overlayCardProgress = (
  anim: AnimState,
  now: number,
): number => {
  if (anim.overlayShownAt === null) return 0;
  return easeOutExpo((now - anim.overlayShownAt) / OVERLAY_CARD_MS);
};
