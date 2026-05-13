import { useGameStore } from '../store';

/**
 * Viewport-fixed toggle that controls whether keyboard-shortcut hints are
 * shown throughout the app. Hidden on touch / small screens via CSS — those
 * users don't have a keyboard to receive the hints anyway.
 *
 * Affects:
 *   - Canvas: paints "1"-"7" above each column and an "Esc" chip below the
 *     in-game MENU button when on.
 *   - Welcome modal: shows a hint footer with arrow-key navigation guidance.
 *   - Reset-confirm modal: shows a hint footer with Enter/Esc guidance.
 *
 * Shortcut: pressing "?" anywhere also toggles this (wired in App.tsx). The
 * inline <kbd> glyph in the button surfaces that shortcut.
 */
export const KeyboardHintsToggle = () => {
  const visible = useGameStore((s) => s.keyboardHintsVisible);
  const toggle = useGameStore((s) => s.toggleKeyboardHints);

  return (
    <button
      type="button"
      className="kb-toggle"
      onClick={toggle}
      aria-pressed={visible}
      aria-label={
        visible
          ? 'Hide keyboard controls throughout the app (shortcut: ?)'
          : 'Show keyboard controls throughout the app (shortcut: ?)'
      }
    >
      <span className="kb-toggle-icon" aria-hidden="true">⌨</span>
      <span className="kb-toggle-label">
        {visible ? 'Hide keyboard controls' : 'Show keyboard controls'}
      </span>
      <kbd className="kb-toggle-key" aria-hidden="true">?</kbd>
    </button>
  );
};
