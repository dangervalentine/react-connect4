import Cell from './Cell';
import { useGameStore } from '../store';
import { ROWS } from '../constants';

type ColumnProps = {
  columnIndex: number;
};

const Column = ({ columnIndex }: ColumnProps) => {
  const isPlaying = useGameStore((state) => state.isPlaying);
  const currentPlayer = useGameStore((state) => state.currentPlayer);
  // gameBoard[columnIndex] keeps its reference until this column is mutated,
  // so this selector only triggers a re-render when *this* column changes.
  const columnValues = useGameStore((state) => state.gameBoard[columnIndex]);
  const winningPieces = useGameStore((state) => state.winningPieces);
  const addPiece = useGameStore((state) => state.addPiece);

  // Top-most empty slot; -1 means the column is full.
  const firstEmpty = columnValues.findIndex((v) => v !== 0) - 1;
  const firstFreeCell = firstEmpty === -2 ? ROWS - 1 : firstEmpty;
  const canDrop = isPlaying && firstFreeCell >= 0;

  const columnHasWinner = winningPieces.some((p) => p.column === columnIndex);

  return (
    <div
      className="column"
      onClick={canDrop ? () => addPiece(firstFreeCell, columnIndex) : undefined}
      data-disabled={!canDrop}
    >
      {columnValues.map((cellValue, rowIndex) => (
        <Cell
          key={rowIndex}
          cellValue={cellValue}
          currentPlayer={currentPlayer}
          isFirstFreeCell={isPlaying && rowIndex === firstFreeCell}
          winningPiece={
            columnHasWinner &&
            winningPieces.some((p) => p.row === rowIndex && p.column === columnIndex)
          }
        />
      ))}
    </div>
  );
};

export default Column;
