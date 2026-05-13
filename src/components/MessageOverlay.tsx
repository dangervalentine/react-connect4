import { useGameStore } from '../store';

const MessageOverlay = () => {
  const winner = useGameStore((state) => state.winner);
  const isDraw = useGameStore((state) => state.isDraw);
  const resetGame = useGameStore((state) => state.resetGame);

  const message = isDraw ? "It's a draw" : `Player ${winner} Wins!`;

  return (
    <div className="message-overlay" role="dialog" aria-modal="true">
      <div className="message-container">
        <div className="message-top-half">
          <h2>{message}</h2>
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
