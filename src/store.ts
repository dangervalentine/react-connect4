import { create } from 'zustand';

import { checkGameBoard, isBoardFull } from './helpers';
import {
  COLUMNS,
  ROWS,
  type Cell,
  type GameBoard,
  type Player,
  type WinningPiece,
} from './constants';

const createEmptyBoard = (): GameBoard =>
  Array.from({ length: COLUMNS }, () => Array<Cell>(ROWS).fill(0));

type GameState = {
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
};

type GameActions = {
  addPiece: (rowIndex: number, columnIndex: number) => void;
  resetGame: () => void;
  incTimer: () => void;
};

const initialState: GameState = {
  isPlaying: true,
  currentPlayer: 1,
  winner: null,
  isDraw: false,
  playerOneTime: 0,
  playerTwoTime: 0,
  showOverlay: false,
  gameBoard: createEmptyBoard(),
  winningPieces: [],
};

export const useGameStore = create<GameState & GameActions>((set) => ({
  ...initialState,

  addPiece: (rowIndex, columnIndex) =>
    set((state) => {
      if (!state.isPlaying) return state;
      // Guard against callers passing -1 (full column) or other out-of-range
      // indices. The component layer also filters these, but the store
      // shouldn't trust its callers.
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
        };
      }

      if (isBoardFull(gameBoard)) {
        return {
          gameBoard,
          isDraw: true,
          showOverlay: true,
          isPlaying: false,
        };
      }

      return {
        gameBoard,
        currentPlayer: state.currentPlayer === 1 ? 2 : 1,
      };
    }),

  resetGame: () =>
    set(() => ({
      ...initialState,
      gameBoard: createEmptyBoard(),
    })),

  incTimer: () =>
    set((state) => {
      if (!state.isPlaying) return state;
      return state.currentPlayer === 1
        ? { playerOneTime: state.playerOneTime + 1 }
        : { playerTwoTime: state.playerTwoTime + 1 };
    }),
}));
