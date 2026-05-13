import { useRef } from 'react';
import { CSSTransition } from 'react-transition-group';
import PropTypes from 'prop-types';

const Cell = props => {
  const { cellValue, winningPiece, isFirstFreeCell, currentPlayer } = props;
  const pieceRef = useRef(null);

  const cellStyle = `
    cell
    ${isFirstFreeCell ? 'glow' : ''}
    ${currentPlayer === 1 ? `red` : `black`}
  `;

  const playerPieceStyle = `
    player-piece
    peice-overlay
    ${cellValue === 1 ? `red` : `black`}
    ${winningPiece ? 'winning-piece' : ''}
  `;

  return (
    <div className="cell-parent">
      <div className={cellStyle} />
      <CSSTransition
        in={cellValue !== 0}
        nodeRef={pieceRef}
        classNames="slide"
        timeout={{ enter: 500, exit: 300 }}
        mountOnEnter
        unmountOnExit
      >
        <div ref={pieceRef} className={playerPieceStyle} />
      </CSSTransition>
    </div>
  );
};

Cell.propTypes = {
  cellValue: PropTypes.number.isRequired,
  winningPiece: PropTypes.bool.isRequired,
  currentPlayer: PropTypes.number.isRequired,
  isFirstFreeCell: PropTypes.bool.isRequired
};

export default Cell;
