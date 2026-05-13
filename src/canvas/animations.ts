/**
 * Mutable animation state held outside React. Updated by store subscribers
 * and input handlers, read by the paint function on every frame.
 */
export type AnimState = {
  /** "col,row" → performance.now() when the drop started. */
  drops: Map<string, number>;
  /** Column the pointer is currently over, or null. */
  hoveredColumn: number | null;
  /** True while the pointer is over the Reset button (canvas-rendered). */
  resetHovered: boolean;
  /** performance.now() when the win/draw overlay first appeared, or null. */
  overlayShownAt: number | null;
};

export const createAnimState = (): AnimState => ({
  drops: new Map(),
  hoveredColumn: null,
  resetHovered: false,
  overlayShownAt: null,
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
export const OVERLAY_BACKDROP_MS = 200;
export const OVERLAY_CARD_MS = 320;
/** One full pulse cycle of a winning piece. */
export const WIN_PULSE_PERIOD_MS = 1400;

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

/** Backdrop opacity 0..1 based on overlay start time. */
export const overlayBackdropAlpha = (
  anim: AnimState,
  now: number,
): number => {
  if (anim.overlayShownAt === null) return 0;
  return easeOutCubic((now - anim.overlayShownAt) / OVERLAY_BACKDROP_MS) * 0.4;
};

/** Card progress 0..1 (used for scale + opacity of the win/draw card). */
export const overlayCardProgress = (
  anim: AnimState,
  now: number,
): number => {
  if (anim.overlayShownAt === null) return 0;
  return easeOutExpo((now - anim.overlayShownAt) / OVERLAY_CARD_MS);
};
