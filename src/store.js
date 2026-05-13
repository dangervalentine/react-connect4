import { create } from 'zustand';
import { checkGameBoard } from './helpers';

const COLUMNS = 7;
const ROWS = 6;

const createEmptyBoard = () =>
  Array.from({ length: COLUMNS }, () => Array(ROWS).fill(0));

const initialState = {
  isPlaying: true,
  currentPlayer: 1,
  playerOneTime: 0,
  playerTwoTime: 0,
  showOverlay: false,
  gameBoard: createEmptyBoard(),
  winningPieces: [],
};

export const useGameStore = create((set) => ({
  ...initialState,

  addPiece: (rowIndex, columnIndex) =>
    set((state) => {
      if (!state.isPlaying) return state;

      // Immutable update: clone the touched column, leave the rest by reference.
      const gameBoard = state.gameBoard.map((column, i) =>
        i === columnIndex
          ? column.map((cell, j) => (j === rowIndex ? state.currentPlayer : cell))
          : column
      );

      const winningPieces = checkGameBoard(gameBoard);
      if (winningPieces) {
        return {
          gameBoard,
          winningPieces,
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
