import React from 'react';
import Button from './Button';
import { useGameContext } from '../context/GameContext';

const Welcome: React.FC = () => {
  const { startGame } = useGameContext();
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <h1 className="text-5xl font-bold mb-6 text-purple-300">Lyric Match</h1>
      <p className="text-xl mb-8 max-w-lg">
        Test your music knowledge! Guess the song title from a snippet of lyrics before time runs out.
      </p>
      
      <div className="bg-gray-800 p-6 rounded-lg mb-8 max-w-lg w-full">
        <h2 className="text-2xl font-bold mb-4 text-teal-300">How to Play</h2>
        <ul className="text-left space-y-2">
          <li>• You'll be given 5 rounds of lyric snippets</li>
          <li>• 30 seconds to guess each song</li>
          <li>• Faster answers = more points</li>
          <li>• Use hints if you're stuck (costs points)</li>
        </ul>
      </div>
      
      <Button 
        onClick={startGame} 
        className="text-xl py-4 px-8 rounded-full"
      >
        Start Game
      </Button>
    </div>
  );
};

export default Welcome;