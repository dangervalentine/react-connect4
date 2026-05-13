import PropTypes from 'prop-types';
import React from 'react';

import Cell from './Cell';

const Column = props => {
  const {
    addPiece,
    isPlaying,
    columnIndex,
    columnValues,
    winningPieces,
    currentPlayer
  } = props;

  let firstFreeCell =
    [...columnValues].findIndex(cellValue => cellValue !== 0) - 1;
  // Initial value with no selected cells will be -2
  firstFreeCell = firstFreeCell === -2 ? 5 : firstFreeCell;

  const hasWinningPieces =
    winningPieces.length > 0 &&
    winningPieces.some(winningPeice => winningPeice.column === columnIndex);

  const cells = columnValues.map((cellValue, i) => {
    const isFirstFreeCell = isPlaying && i === firstFreeCell;
    const isWinningPiece =
      hasWinningPieces &&
      winningPieces.some(x => x.row === i && x.column === columnIndex);

    return (
      <Cell
        key={i}
        cellIndex={i}
        cellValue={cellValue}
        columnIndex={columnIndex}
        winningPiece={isWinningPiece}
        currentPlayer={currentPlayer}
        isFirstFreeCell={isFirstFreeCell}
      />
    );
  });

  return (
    <div
      className="column"
      onClick={() => addPiece(firstFreeCell, columnIndex)}
    >
      {cells}
    </div>
  );
};

Column.propTypes = {
  addPiece: PropTypes.func.isRequired,
  isPlaying: PropTypes.bool.isRequired,
  columnIndex: PropTypes.number.isRequired,
  columnValues: PropTypes.array.isRequired,
  winningPieces: PropTypes.array.isRequired,
  currentPlayer: PropTypes.number.isRequired
};

export default Column;
