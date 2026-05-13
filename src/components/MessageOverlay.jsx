import { useRef } from 'react';
import { CSSTransition } from 'react-transition-group';
import PropTypes from 'prop-types';

const MessageOverlay = props => {
  const { winningPlayer, resetGame } = props;
  const overlayRef = useRef(null);

  return (
    <div className="message-overlay">
      <CSSTransition
        in
        appear
        nodeRef={overlayRef}
        classNames="side-slide"
        timeout={{ enter: 500, exit: 200 }}
      >
        <div ref={overlayRef} className="message-container">
          <div className="message-top-half">
            <h2>{`Player ${winningPlayer} Wins!`}</h2>
          </div>
          <div className="message-bottom-half">
            <button className="message-button" onClick={() => resetGame()}>
              Reset
            </button>
          </div>
        </div>
      </CSSTransition>
    </div>
  );
};

MessageOverlay.propTypes = {
  winningPlayer: PropTypes.number.isRequired,
  resetGame: PropTypes.func.isRequired
};

export default MessageOverlay;
