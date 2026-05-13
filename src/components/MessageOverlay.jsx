import { useGameStore } from '../store';

const MessageOverlay = () => {
  const winningPlayer = useGameStore((state) => state.currentPlayer);
  const resetGame = useGameStore((state) => state.resetGame);

  return (
    <div className="message-overlay" role="dialog" aria-modal="true">
      <div className="message-container">
        <div className="message-top-half">
          <h2>{`Player ${winningPlayer} Wins!`}</h2>
        </div>
        <div className="message-bottom-half">
          <button type="button" className="message-button" onClick={resetGame}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageOverlay;
