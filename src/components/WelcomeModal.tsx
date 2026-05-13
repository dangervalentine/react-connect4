import { useEffect, useState, type ReactNode } from 'react';

import { useGameStore } from '../store';
import type { Difficulty, GameMode, PieceColor } from '../constants';

/**
 * Pre-game setup modal. Renders on top of the canvas when gamePhase is 'setup'.
 *
 * Form state is local: the player can toggle options without touching the
 * store until they commit by clicking "Play". The fields are pre-filled from
 * the store's last selections so a returning player keeps their preferences.
 */

type PillProps = {
  checked: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
};

const Pill = ({ checked, onClick, children, ariaLabel }: PillProps) => (
  <button
    type="button"
    className={`pill${checked ? ' pill-checked' : ''}`}
    aria-pressed={checked}
    aria-label={ariaLabel}
    onClick={onClick}
  >
    {children}
  </button>
);

export const WelcomeModal = () => {
  // We only mount/unmount on gamePhase changes — but selectors still need to
  // be stable, so we read everything we need up-front.
  const startGame = useGameStore((s) => s.startGame);
  const initMode = useGameStore((s) => s.mode);
  const initDifficulty = useGameStore((s) => s.difficulty);
  const initColor = useGameStore((s) => s.humanColor);
  const initTimers = useGameStore((s) => s.timersEnabled);

  const [mode, setMode] = useState<GameMode>(initMode);
  const [difficulty, setDifficulty] = useState<Difficulty>(initDifficulty);
  const [humanColor, setHumanColor] = useState<PieceColor>(initColor);
  const [timersEnabled, setTimersEnabled] = useState<boolean>(initTimers);

  // Pull focus to the modal when it opens so keyboard users land on it. The
  // first focusable element is the first pill — autoFocus on the Play button
  // would skip past everything, which feels wrong.
  useEffect(() => {
    const firstPill = document.querySelector<HTMLButtonElement>('.modal .pill');
    firstPill?.focus();
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startGame({ mode, difficulty, humanColor, timersEnabled });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-subtitle"
      >
        <h1 id="welcome-title" className="modal-title">
          Connect 4
        </h1>
        <p id="welcome-subtitle" className="modal-subtitle">
          Get four of your pieces in a row before your opponent does.
        </p>

        <form onSubmit={submit}>
          <fieldset className="form-group">
            <legend>Opponent</legend>
            <div className="segmented segmented-2">
              <Pill checked={mode === 'pvp'} onClick={() => setMode('pvp')}>
                Human
              </Pill>
              <Pill checked={mode === 'pve'} onClick={() => setMode('pve')}>
                Computer
              </Pill>
            </div>
          </fieldset>

          {mode === 'pve' && (
            <fieldset className="form-group">
              <legend>Difficulty</legend>
              <div className="segmented segmented-3">
                <Pill
                  checked={difficulty === 'easy'}
                  onClick={() => setDifficulty('easy')}
                >
                  Easy
                </Pill>
                <Pill
                  checked={difficulty === 'medium'}
                  onClick={() => setDifficulty('medium')}
                >
                  Medium
                </Pill>
                <Pill
                  checked={difficulty === 'hard'}
                  onClick={() => setDifficulty('hard')}
                >
                  Hard
                </Pill>
              </div>
            </fieldset>
          )}

          <fieldset className="form-group">
            <legend>Your piece</legend>
            <div className="segmented segmented-2">
              <Pill
                checked={humanColor === 'red'}
                onClick={() => setHumanColor('red')}
                ariaLabel="Play as red, go first"
              >
                <span className="piece-dot piece-dot-red" aria-hidden="true" />
                <span className="pill-stack">
                  <span>Red</span>
                  <span className="pill-meta">goes first</span>
                </span>
              </Pill>
              <Pill
                checked={humanColor === 'black'}
                onClick={() => setHumanColor('black')}
                ariaLabel="Play as black, go second"
              >
                <span className="piece-dot piece-dot-black" aria-hidden="true" />
                <span className="pill-stack">
                  <span>Black</span>
                  <span className="pill-meta">goes second</span>
                </span>
              </Pill>
            </div>
          </fieldset>

          <fieldset className="form-group">
            <legend>Timers</legend>
            <div className="segmented segmented-2">
              <Pill
                checked={timersEnabled}
                onClick={() => setTimersEnabled(true)}
              >
                On
              </Pill>
              <Pill
                checked={!timersEnabled}
                onClick={() => setTimersEnabled(false)}
              >
                Off
              </Pill>
            </div>
          </fieldset>

          <button type="submit" className="primary-btn">
            Play
          </button>
        </form>
      </div>
    </div>
  );
};
