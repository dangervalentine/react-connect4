/*
 * Night Owl — dark palette.
 *
 * The `colors` tree below is the `dark` branch of the shared design tokens
 * (packages/shared/src/tokens.ts), reproduced verbatim so this file stays
 * diffable against the generated source. Don't hand-tune values here; change
 * them upstream and re-copy.
 *
 * Everything the app paints — canvas and DOM alike — resolves through this
 * module. `game` names the tokens in Connect 4 terms for the canvas; the same
 * values are pushed onto :root as custom properties by `applyThemeVars()` so
 * App.css draws from the identical source and the two can't drift.
 */

export const colors = {
  primary: {
    light: '#AFC6FF',
    main: '#82AAFF',
    dark: '#4976A1',
  },
  secondary: {
    light: '#A3B7C7',
    main: '#8DA0AF',
    dark: '#2A3F51',
  },
  accent: {
    cyan: '#7fdbca',
    coral: '#FFAB70',
    green: '#C3E88D',
    pink: '#F07178',
    yellow: '#FFCB6B',
    purple: '#C792EA',
  },
  status: {
    playing: '#D4A44E',
    queued: '#4EA8C4',
    completed: '#6DAE6A',
    dropped: '#C87070',
    backlog: '#9878BE',
  },
  semantic: {
    success: '#C3E88D',
    warning: '#FFCB6B',
    error: '#F07178',
    info: '#82AAFF',
  },
  neutral: {
    white: '#FFFFFF',
    lightGray: '#D6DEEB',
    gray: '#637777',
    darkGray: '#1D3B53',
    black: '#000000',
  },
  background: {
    light: '#D6DEEB',
    medium: '#1D3B53',
    elevated: '#132A3E',
    surface: '#0A1E30',
    base: '#011627',
    card: '#011627',
    floor: '#010E18',
    scrim: 'rgba(1, 22, 39, 0.6)',
  },
  text: {
    primary: '#D6DEEB',
    secondary: '#9DB2C0',
    inverse: '#011627',
    muted: '#7E8E94',
  },
} as const;

// ───────────────────────── color helpers ─────────────────────────

/** Parse `#rgb` / `#rrggbb` into an [r, g, b] triple of 0-255 ints. */
const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

/** `#rrggbb` at the given opacity, as an `rgba()` string. */
export const alpha = (hex: string, a: number): string => {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/**
 * Linear blend between two hex colors. `t` is how far to travel from `from`
 * toward `to` (0 = from, 1 = to). Used to derive the lit stop of each piece's
 * gradient rather than hardcoding a second hue per player.
 */
export const mix = (from: string, to: string, t: number): string => {
  const a = parseHex(from);
  const b = parseHex(to);
  const ch = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `#${[ch(0), ch(1), ch(2)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
};

// ───────────────────────── game palette ─────────────────────────

const { accent, background, neutral, primary, text } = colors;

/**
 * Tokens named for what they paint. The canvas imports this; App.css reads the
 * same values through the `--no-*` / `--ui-*` custom properties below.
 */
export const game = {
  // Background vignette — bright at the middle, deepening to the corners.
  bgCenter: background.base,
  bgEdge: background.floor,

  // Board face. Three stops top-to-bottom so the slate reads as a faintly
  // lit surface rather than a flat rectangle, same structure as before.
  faceTop: background.medium,
  faceMid: background.elevated,
  faceBottom: background.surface,

  // Support feet. On the light board these were painted in the deep back
  // tone to read as plastic *behind* the face. That inverts on dark: "further
  // back" means "invisible", and the feet share an edge with the bottom of
  // the face gradient. So they go a step lighter instead — same tone as the
  // top of the face, which reads as the lit edge of the stand.
  feet: background.medium,

  // Hole interior. Has to go much deeper than it did on the yellow board —
  // on a dark face, anything short of near-opaque stops reading as a cavity.
  holeBack: alpha(background.floor, 0.95),
  holeRim: alpha(background.base, 0.75),

  archHighlight: alpha(text.primary, 0.22),

  // Pieces. Player 1 coral-red, player 2 mint. The lit stop of each gradient
  // is derived rather than picked, so both chips catch light identically.
  p1: accent.pink,
  p1Soft: mix(accent.pink, neutral.white, 0.35),
  p2: accent.cyan,
  p2Soft: mix(accent.cyan, neutral.white, 0.35),

  pieceEmboss: alpha(background.floor, 0.55),
  pieceSpecular: alpha(neutral.white, 0.45),

  // Winning pieces cross-fade to a bright neutral gloss.
  winnerCore: neutral.white,
  winnerMid: text.primary,
  winnerEdge: text.secondary,
  winnerRing: neutral.white,

  columnHover: primary.main,

  // "CONNECT4" on the bottom arch. The one warm anchor in the composition,
  // and far enough from both piece colors that it never reads as a player.
  title: accent.yellow,

  textOnBg: text.primary,
  textMuted: text.muted,

  clockBg: alpha(background.elevated, 0.55),
  clockBgActive: alpha(background.medium, 0.85),
  discOutline: alpha(text.primary, 0.35),

  // End-of-game banner. A vertical gradient plus a hairline of light along
  // the top inner edge is what reads as "raised" on a dark ground — a drop
  // shadow alone has nothing to fall against.
  cardTop: background.elevated,
  cardBottom: background.surface,
  cardShadow: alpha(background.floor, 0.55),
  cardHighlight: alpha(text.primary, 0.1),
  cardText: text.primary,
  cardCaption: text.muted,
  // The draw token is a chip like any other, so it needs a lit stop too —
  // otherwise it renders flat next to the winner's and looks unfinished.
  drawStripe: text.muted,
  drawStripeSoft: mix(text.muted, neutral.white, 0.35),

  // Buttons (banner "Menu" + in-canvas MENU). Filled in the brand blue with
  // inverse text; hover lifts to the lighter tint rather than swapping to white.
  btnFill: primary.main,
  btnFillHover: primary.light,
  btnText: text.inverse,

  menuFill: alpha(text.primary, 0.1),
  menuBorder: alpha(text.primary, 0.35),

  // Canvas-painted kbd chip under the MENU button.
  kbdFill: background.elevated,
  kbdBorder: alpha(text.primary, 0.3),
  hintText: alpha(text.primary, 0.78),
} as const;

// ───────────────────────── CSS custom properties ─────────────────────────

/**
 * Flatten the token tree to `--no-<group>-<key>`, plus a handful of `--ui-*`
 * values that App.css needs pre-composited (alpha blends of a token, which
 * plain CSS can't derive without color-mix()).
 */
export const cssVars = (): Record<string, string> => {
  const vars: Record<string, string> = {};

  for (const [group, entries] of Object.entries(colors)) {
    for (const [key, value] of Object.entries(entries)) {
      vars[`--no-${group}-${key}`] = value;
    }
  }

  vars['--ui-hairline'] = alpha(colors.text.primary, 0.08);
  vars['--ui-hairline-strong'] = alpha(colors.text.primary, 0.18);
  vars['--ui-chip-fill'] = alpha(colors.background.elevated, 0.92);
  vars['--ui-key-fill'] = alpha(colors.text.primary, 0.1);
  vars['--ui-key-fill-on-accent'] = alpha(colors.text.inverse, 0.18);
  vars['--ui-key-border-on-accent'] = alpha(colors.text.inverse, 0.35);
  vars['--ui-hint-bg'] = alpha(colors.primary.main, 0.1);
  vars['--ui-shadow-soft'] = alpha(colors.background.floor, 0.45);
  vars['--ui-shadow-deep'] = alpha(colors.background.floor, 0.7);
  vars['--ui-focus-ring'] = colors.primary.main;
  vars['--ui-primary-glow'] = alpha(colors.primary.main, 0.28);

  return vars;
};

/** Install the palette on :root. Called once, before the app mounts. */
export const applyThemeVars = (
  root: HTMLElement = document.documentElement,
): void => {
  for (const [name, value] of Object.entries(cssVars())) {
    root.style.setProperty(name, value);
  }
};
