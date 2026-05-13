import { useEffect, useRef } from 'react';

import { useGameStore } from '../store';

/**
 * Confirmation dialog shown when the player clicks the in-game MENU button.
 * Returning to setup discards the current game; cancelling closes the dialog
 * and resumes play unchanged.
 */
export const ResetConfirmModal = () => {
  const cancelResetRequest = useGameStore((s) => s.cancelResetRequest);
  const openSetup = useGameStore((s) => s.openSetup);
  const keyboardHintsVisible = useGameStore((s) => s.keyboardHintsVisible);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel by default — destructive action is never the default focus.
  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  /**
   * Swap focus between Cancel and Return with arrow keys. Mirrors the modal's
   * other keyboard affordances — Esc to dismiss, Enter to activate the
   * focused button.
   */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelResetRequest();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      cancelButtonRef.current?.focus();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      confirmButtonRef.current?.focus();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal modal-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        aria-describedby="reset-description"
        onKeyDown={onKeyDown}
      >
        <h2 id="reset-title" className="modal-title-sm">
          Return to setup?
        </h2>
        <p id="reset-description" className="modal-subtitle-sm">
          Your current game will be discarded.
        </p>
        <div className="confirm-actions">
          <button
            type="button"
            ref={cancelButtonRef}
            className="secondary-btn"
            onClick={cancelResetRequest}
          >
            Cancel
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            className="danger-btn"
            onClick={openSetup}
          >
            Return
          </button>
        </div>

        {keyboardHintsVisible && (
          <p className="modal-kb-hint" role="note">
            <kbd>←</kbd> <kbd>→</kbd> to swap, <kbd>Enter</kbd> to confirm,{' '}
            <kbd>Esc</kbd> to cancel.
          </p>
        )}
      </div>
    </div>
  );
};
