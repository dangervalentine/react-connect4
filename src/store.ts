import { create } from 'zustand';

import { checkGameBoard, isBoardFull } from './helpers';
import {
  COLUMNS,
  ROWS,
  type Cell,
  type Difficulty,
  type GameBoard,
  type GameConfig,
  type GameMode,
  type GamePhase,
  type PieceColor,
  type Player,
  type WinningPiece,
  playerForColor,
} from './constants';

const createEmptyBoard = (): GameBoard =>
  Array.from({ length: COLUMNS }, () => Array<Cell>(ROWS).fill(0));

type GameState = {
  /** Drives whether the welcome modal or the gameplay canvas is interactive. */
  gamePhase: GamePhase;
  mode: GameMode;
  difficulty: Difficulty;
  humanColor: PieceColor;
  timersEnabled: boolean;
  /** Which player is the AI (1 or 2); null while in PvP. */
  aiPlayer: Player | null;
  /** True while the AI is computing a move — used to gate input + show indicator. */
  aiThinking: boolean;

  isPlaying: boolean;
  currentPlayer: Player;
  /** Set on win; null while the game is still live or ended in a draw. */
  winner: Player | null;
  /** Set when the board fills with no winner. */
  isDraw: boolean;
  playerOneTime: number;
  playerTwoTime: number;
  showOverlay: boolean;
  gameBoard: GameBoard;
  winningPieces: WinningPiece[];
  /** Drives the mid-game "return to setup?" confirmation modal. */
  showResetConfirm: boolean;
};

type GameActions = {
  /** Starts a new game with the given config and moves to gamePhase 'playing'. */
  startGame: (config: GameConfig) => void;
  /** Returns to the welcome modal, preserving the last-used config defaults. */
  openSetup: () => void;
  /** Reset the board but keep the active config; used by win/draw overlay's "Play again". */
  resetGame: () => void;
  /** Open / close the mid-game reset confirmation modal. */
  requestReset: () => void;
  cancelResetRequest: () => void;
  addPiece: (rowIndex: number, columnIndex: number) => void;
  incTimer: () => void;
  setAiThinking: (thinking: boolean) => void;
};

/**
 * Persistent across resets: the last setup the player chose. Lets "Play again"
 * keep the same opponent and timer choice, and lets the welcome modal pre-fill
 * with their previous values when reopened.
 */
const defaultConfig: GameConfig = {
  mode: 'pvp',
  difficulty: 'medium',
  humanColor: 'red',
  timersEnabled: true,
};

const freshBoardState = () => ({
  isPlaying: false,
  currentPlayer: 1 as Player,
  winner: null as Player | null,
  isDraw: false,
  playerOneTime: 0,
  playerTwoTime: 0,
  showOverlay: false,
  gameBoard: createEmptyBoard(),
  winningPieces: [] as WinningPiece[],
  showResetConfirm: false,
  aiThinking: false,
});

const initialState: GameState = {
  gamePhase: 'setup',
  ...defaultConfig,
  aiPlayer: null,
  ...freshBoardState(),
};

export const useGameStore = create<GameState & GameActions>((set) => ({
  ...initialState,

  startGame: (config) =>
    set(() => {
      // In PvE: AI plays the *other* color. In PvP: aiPlayer is null.
      const humanPlayer = playerForColor(config.humanColor);
      const aiPlayer: Player | null =
        config.mode === 'pve' ? ((humanPlayer === 1 ? 2 : 1) as Player) : null;

      return {
        ...freshBoardState(),
        gamePhase: 'playing' as GamePhase,
        mode: config.mode,
        difficulty: config.difficulty,
        humanColor: config.humanColor,
        timersEnabled: config.timersEnabled,
        aiPlayer,
        isPlaying: true,
      };
    }),

  openSetup: () =>
    set((state) => ({
      ...freshBoardState(),
      // Preserve the last config so the modal pre-fills it.
      gamePhase: 'setup' as GamePhase,
      mode: state.mode,
      difficulty: state.difficulty,
      humanColor: state.humanColor,
      timersEnabled: state.timersEnabled,
      aiPlayer: null,
    })),

  resetGame: () =>
    set((state) => ({
      ...freshBoardState(),
      // Keep the active config: same opponent and color stay in play.
      gamePhase: 'playing' as GamePhase,
      mode: state.mode,
      difficulty: state.difficulty,
      humanColor: state.humanColor,
      timersEnabled: state.timersEnabled,
      aiPlayer: state.aiPlayer,
      isPlaying: true,
    })),

  requestReset: () => set(() => ({ showResetConfirm: true })),
  cancelResetRequest: () => set(() => ({ showResetConfirm: false })),

  addPiece: (rowIndex, columnIndex) =>
    set((state) => {
      if (!state.isPlaying) return state;
      if (
        columnIndex < 0 ||
        columnIndex >= COLUMNS ||
        rowIndex < 0 ||
        rowIndex >= ROWS
      ) {
        return state;
      }
      if (state.gameBoard[columnIndex][rowIndex] !== 0) return state;

      // Immutable per-column update: clone the touched column, leave the rest
      // by reference so Zustand selectors on other columns don't re-fire.
      const gameBoard: GameBoard = state.gameBoard.map((column, i) =>
        i === columnIndex
          ? column.map((cell, j) => (j === rowIndex ? state.currentPlayer : cell))
          : column
      );

      const winningPieces = checkGameBoard(gameBoard);
      if (winningPieces) {
        return {
          gameBoard,
          winningPieces,
          winner: state.currentPlayer,
          showOverlay: true,
          isPlaying: false,
          gamePhase: 'finished' as GamePhase,
          aiThinking: false,
        };
      }

      if (isBoardFull(gameBoard)) {
        return {
          gameBoard,
          isDraw: true,
          showOverlay: true,
          isPlaying: false,
          gamePhase: 'finished' as GamePhase,
          aiThinking: false,
        };
      }

      return {
        gameBoard,
        currentPlayer: state.currentPlayer === 1 ? 2 : 1,
        aiThinking: false,
      };
    }),

  incTimer: () =>
    set((state) => {
      if (!state.isPlaying || !state.timersEnabled) return state;
      return state.currentPlayer === 1
        ? { playerOneTime: state.playerOneTime + 1 }
        : { playerTwoTime: state.playerTwoTime + 1 };
    }),

  setAiThinking: (thinking) => set(() => ({ aiThinking: thinking })),
}));
