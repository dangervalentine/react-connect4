import { useGameStore } from '../store';
import type { Player } from '../constants';

type PlayClockProps = {
  player: Player;
};

const PlayClock = ({ player }: PlayClockProps) => {
  // Each clock subscribes to only its own time slice, so the idle player's
  // clock doesn't re-render every tick.
  const time = useGameStore((state) =>
    player === 1 ? state.playerOneTime : state.playerTwoTime
  );

  return (
    <div className="playclock">
      <h2>Player {player} Time:</h2>
      <div className="playclock-time">{time}</div>
    </div>
  );
};

export default PlayClock;
