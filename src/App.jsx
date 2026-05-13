import { useEffect } from 'react';

import Column from './components/Column';
import Container from './components/Container';
import PlayClock from './components/PlayClock';
import MessageOverlay from './components/MessageOverlay';

import { useGameStore } from './store';

const COLUMN_COUNT = 7;

const App = () => {
  const isPlaying = useGameStore((state) => state.isPlaying);
  const showOverlay = useGameStore((state) => state.showOverlay);
  const incTimer = useGameStore((state) => state.incTimer);

  // Only run the wall-clock while the game is live; clean up on unmount or pause.
  useEffect(() => {
    if (!isPlaying) return undefined;
    const id = setInterval(incTimer, 1000);
    return () => clearInterval(id);
  }, [isPlaying, incTimer]);

  const columns = Array.from({ length: COLUMN_COUNT }, (_, index) => (
    <Column key={index} columnIndex={index} />
  ));

  return (
    <div className="App">
      {showOverlay && <MessageOverlay />}
      <div className="playclocks">
        <PlayClock player={1} />
        <PlayClock player={2} />
      </div>
      <Container columns={columns} />
    </div>
  );
};

export default App;
