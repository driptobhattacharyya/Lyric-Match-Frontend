import React from 'react';
import { GameProvider, useGameContext } from './context/GameContext';
import Welcome from './components/Welcome';
import Game from './components/Game';
import Results from './components/Results';

// Main game container component
const GameContainer: React.FC = () => {
  const { gameState } = useGameContext();
  
  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white p-4 overflow-auto">
      <div className="flex-grow h-full">
        {gameState === 'welcome' && <Welcome />}
        {gameState === 'playing' && <Game />}
        {gameState === 'results' && <Results />}
      </div>
    </div>
  );
};

// Main App with provider
const App: React.FC = () => {
  return (
    <GameProvider>
      <GameContainer />
    </GameProvider>
  );
};

export default App;