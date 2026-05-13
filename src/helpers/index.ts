import { COLUMNS, ROWS, WIN_LENGTH, type GameBoard, type WinningPiece } from '../constants';

// 4 unit vectors covering the directions a winning line can run.
// We only need one direction per axis — the reverse is found by starting from
// the other end of the line, which the (col,row) sweep will hit anyway.
//
// With row 0 at the top of a column and pieces falling toward higher row
// indices, these read as:
//   [ 1, 0]  → horizontal, sweeping right
//   [ 0, 1]  → vertical,   sweeping down (i.e. into the column)
//   [ 1, 1]  → diagonal,   right-and-down
//   [ 1,-1]  → diagonal,   right-and-up
const DIRECTIONS: ReadonlyArray<readonly [dCol: number, dRow: number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/**
 * Scan the board for any winning lines of length WIN_LENGTH.
 * Returns the cells that make up the win(s), or null when there is no winner.
 *
 * Detects every simultaneous winning line — e.g. a move that completes both
 * a vertical and a diagonal at once will include all distinct cells.
 */
export const checkGameBoard = (gameBoard: GameBoard): WinningPiece[] | null => {
  const winners: WinningPiece[] = [];

  for (let col = 0; col < COLUMNS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const player = gameBoard[col][row];
      if (player === 0) continue;

      for (const [dCol, dRow] of DIRECTIONS) {
        const endCol = col + dCol * (WIN_LENGTH - 1);
        const endRow = row + dRow * (WIN_LENGTH - 1);

        // Skip lines that would run off the board.
        if (endCol < 0 || endCol >= COLUMNS) continue;
        if (endRow < 0 || endRow >= ROWS) continue;

        let isWin = true;
        for (let i = 1; i < WIN_LENGTH; i++) {
          if (gameBoard[col + dCol * i][row + dRow * i] !== player) {
            isWin = false;
            break;
          }
        }

        if (isWin) {
          for (let i = 0; i < WIN_LENGTH; i++) {
            winners.push({
              column: col + dCol * i,
              row: row + dRow * i,
            });
          }
        }
      }
    }
  }

  return winners.length > 0 ? winners : null;
};

/** True when every cell on the board is occupied. */
export const isBoardFull = (gameBoard: GameBoard): boolean =>
  gameBoard.every((column) => column.every((cell) => cell !== 0));
