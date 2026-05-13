const cx = (...classes) => classes.filter(Boolean).join(' ');

const Cell = ({ cellValue, winningPiece, isFirstFreeCell, currentPlayer }) => {
  const cellClassName = cx(
    'cell',
    isFirstFreeCell && 'glow',
    currentPlayer === 1 ? 'red' : 'black'
  );

  const pieceClassName = cx(
    'player-piece',
    cellValue === 1 ? 'red' : 'black',
    winningPiece && 'winning-piece'
  );

  return (
    <div className="cell-parent">
      <div className={cellClassName} />
      {cellValue !== 0 && (
        // key on cellValue so a reset (cellValue 1|2 → 0 → 1|2) replays the drop animation.
        <div key={cellValue} className={pieceClassName} />
      )}
    </div>
  );
};

export default Cell;
