import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { selectShowKeyboardHints, useGameStore } from '../store';
import type { Difficulty, GameMode, PieceColor } from '../constants';

/**
 * Pre-game setup modal. Renders on top of the canvas when gamePhase is 'setup'.
 *
 * Form state is local: the player can toggle options without touching the
 * store until they commit by clicking "Play". The fields are pre-filled from
 * the store's last selections so a returning player keeps their preferences.
 *
 * Keyboard navigation
 * -------------------
 * Each segmented control implements the "roving tabindex" pattern. Within a
 * group, only the currently-selected pill is tabbable (tabIndex=0); arrow
 * keys move focus between options *and select them*. Tab moves between
 * groups + the Play button. This matches the WAI-ARIA radiogroup behavior.
 */

type SegmentedProps<T extends string | boolean> = {
  legend: string;
  /** Unique class hook for layout (segmented-2 / segmented-3). */
  layoutClass: 'segmented-2' | 'segmented-3';
  /** Ordered list of options with their display label / extra content. */
  options: ReadonlyArray<{ value: T; render: ReactNode; ariaLabel?: string }>;
  value: T;
  onChange: (next: T) => void;
};

const Segmented = <T extends string | boolean>({
  legend,
  layoutClass,
  options,
  value,
  onChange,
}: SegmentedProps<T>) => {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const move = useCallback(
    (delta: number, currentIdx: number) => {
      const len = options.length;
      const nextIdx = (currentIdx + delta + len) % len;
      const next = options[nextIdx].value;
      onChange(next);
      // Move focus to follow the selection — standard roving-tabindex behavior.
      requestAnimationFrame(() => buttonsRef.current[nextIdx]?.focus());
    },
    [options, onChange],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(1, idx);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(-1, idx);
        break;
      case 'Home':
        event.preventDefault();
        onChange(options[0].value);
        requestAnimationFrame(() => buttonsRef.current[0]?.focus());
        break;
      case 'End':
        event.preventDefault();
        onChange(options[options.length - 1].value);
        requestAnimationFrame(() =>
          buttonsRef.current[options.length - 1]?.focus(),
        );
        break;
    }
  };

  return (
    <fieldset className="form-group">
      <legend>{legend}</legend>
      <div
        className={`segmented ${layoutClass}`}
        role="radiogroup"
        aria-label={legend}
      >
        {options.map((opt, idx) => {
          const checked = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              ref={(el) => {
                buttonsRef.current[idx] = el;
              }}
              type="button"
              role="radio"
              className={`pill${checked ? ' pill-checked' : ''}`}
              aria-checked={checked}
              aria-label={opt.ariaLabel}
              // Roving tabindex: only the selected option is in the Tab order
              // so keyboard users move *between groups* with Tab, not between
              // individual options.
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => onKeyDown(e, idx)}
            >
              {opt.render}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
};

export const WelcomeModal = () => {
  const startGame = useGameStore((s) => s.startGame);
  const initMode = useGameStore((s) => s.mode);
  const initDifficulty = useGameStore((s) => s.difficulty);
  const initColor = useGameStore((s) => s.humanColor);
  const initTimers = useGameStore((s) => s.timersEnabled);
  const keyboardHintsVisible = useGameStore(selectShowKeyboardHints);

  const [mode, setMode] = useState<GameMode>(initMode);
  const [difficulty, setDifficulty] = useState<Difficulty>(initDifficulty);
  const [humanColor, setHumanColor] = useState<PieceColor>(initColor);
  const [timersEnabled, setTimersEnabled] = useState<boolean>(initTimers);

  // Pull focus to the modal when it opens so keyboard users land on it.
  useEffect(() => {
    const firstPill = document.querySelector<HTMLButtonElement>(
      '.modal .pill[tabindex="0"]',
    );
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
          <Segmented<GameMode>
            legend="Opponent"
            layoutClass="segmented-2"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'pvp', render: 'Human' },
              { value: 'pve', render: 'Computer' },
            ]}
          />

          {mode === 'pve' && (
            <Segmented<Difficulty>
              legend="Difficulty"
              layoutClass="segmented-3"
              value={difficulty}
              onChange={setDifficulty}
              options={[
                { value: 'easy', render: 'Easy' },
                { value: 'medium', render: 'Medium' },
                { value: 'hard', render: 'Hard' },
              ]}
            />
          )}

          <Segmented<PieceColor>
            legend="Your piece"
            layoutClass="segmented-2"
            value={humanColor}
            onChange={setHumanColor}
            options={[
              {
                value: 'red',
                ariaLabel: 'Play as red, go first',
                render: (
                  <>
                    <span
                      className="piece-dot piece-dot-red"
                      aria-hidden="true"
                    />
                    <span className="pill-stack">
                      <span>Red</span>
                      <span className="pill-meta">goes first</span>
                    </span>
                  </>
                ),
              },
              {
                value: 'black',
                ariaLabel: 'Play as black, go second',
                render: (
                  <>
                    <span
                      className="piece-dot piece-dot-black"
                      aria-hidden="true"
                    />
                    <span className="pill-stack">
                      <span>Black</span>
                      <span className="pill-meta">goes second</span>
                    </span>
                  </>
                ),
              },
            ]}
          />

          <Segmented<boolean>
            legend="Timers"
            layoutClass="segmented-2"
            value={timersEnabled}
            onChange={setTimersEnabled}
            options={[
              { value: true, render: 'On' },
              { value: false, render: 'Off' },
            ]}
          />

          <button type="submit" className="primary-btn">
            Play
          </button>

          {keyboardHintsVisible && (
            <p className="modal-kb-hint" role="note">
              Use <kbd>←</kbd> <kbd>→</kbd> to switch options,{' '}
              <kbd>Tab</kbd> to move between groups, <kbd>Enter</kbd> to play.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
