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
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel by default — destructive action is never the default focus.
  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  // Allow Enter to dismiss when Cancel is focused; Esc is handled globally
  // in the canvas keydown handler, but we re-handle it here so the modal
  // works even if focus is inside it.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelResetRequest();
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
            className="danger-btn"
            onClick={openSetup}
          >
            Return
          </button>
        </div>
      </div>
    </div>
  );
};
