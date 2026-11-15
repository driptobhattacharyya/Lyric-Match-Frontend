import React from 'react';
import { useGameContext } from '../context/GameContext';
import Button from './Button';

const Results: React.FC = () => {
  const { results, score, totalRounds, startGame, resetGame } = useGameContext();
  
  // Calculate correct answers
  const correctAnswers = results.filter(result => result.correct).length;
  
  // Function to share score (can be expanded with social media integration)
  const handleShareScore = () => {
    // Simple implementation - copy text to clipboard
    const shareText = `I scored ${score} points in Lyric Match! I got ${correctAnswers} out of ${totalRounds} songs correct.`;
    navigator.clipboard.writeText(shareText)
      .then(() => alert('Score copied to clipboard!'))
      .catch(err => console.error('Failed to copy text: ', err));
  };
  
  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <h1 className="text-4xl font-bold mb-6 text-purple-300">Game Results</h1>
      
      <div className="bg-gray-800 p-6 rounded-lg mb-8 max-w-3xl w-full">
        <h2 className="text-3xl font-bold mb-2 text-center">
          Total Score: <span className="text-yellow-400">{score}</span>
        </h2>
        <p className="text-center mb-6 text-teal-300">
          You got {correctAnswers} out of {totalRounds} correct!
        </p>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="py-2 text-left">Round</th>
                <th className="py-2 text-left">Song</th>
                <th className="py-2 text-left">Artist</th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-left">Time</th>
                <th className="py-2 text-left">Points</th>
              </tr>
            </thead>
            <tbody>
              {results.map(result => (
                <tr key={result.round} className="border-b border-gray-700">
                  <td className="py-3">{result.round}</td>
                  <td className="py-3">{result.song}</td>
                  <td className="py-3">{result.artist}</td>
                  <td className="py-3">
                    {result.correct ? 
                      <span className="text-green-400">✓ Correct</span> : 
                      <span className="text-red-400">✗ Incorrect</span>
                    }
                  </td>
                  <td className="py-3">{result.timeUsed}s</td>
                  <td className="py-3 font-bold">{result.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="flex space-x-4">
        <Button onClick={startGame}>
          Play Again
        </Button>
        <Button onClick={handleShareScore} variant="secondary">
          Share Score
        </Button>
      </div>
    </div>
  );
};

export default Results;