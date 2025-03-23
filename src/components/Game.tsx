import React, { useState, useEffect } from 'react';
import { useGameContext } from '../context/GameContext';
import CircularTimer from './CircularTimer';
import ProgressBar from './ProgressBar';
import AudioVisualizer from './AudioVisualizer';
import Button from './Button';

const Game: React.FC = () => {
  const {
    currentRound,
    totalRounds,
    timeRemaining,
    score,
    currentLyrics,
    currentArtist,
    currentSongTitle,
    guess,
    setGuess,
    hintLevel,
    requestHint,
    feedback,
    submitGuess,
    skipRound,
    isLoading,
    error,
    artistHintRevealed,
    revealArtistHint,  // Use this from context instead of local implementation
  } = useGameContext();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [skipCountdown, setSkipCountdown] = useState(0);
  // Handle the skip transition
  useEffect(() => {
    let timer: number | undefined;
    
    if (isSkipping && skipCountdown > 0) {
      timer = window.setTimeout(() => {
        setSkipCountdown(prev => prev - 1);
      }, 1000);
    } else if (isSkipping && skipCountdown === 0) {
      // After countdown finishes, call the context's skipRound function
      setIsSkipping(false);
      skipRound();
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isSkipping, skipCountdown, skipRound]);

  // Function to handle skip button click
  const handleSkip = () => {
    setIsSkipping(true);
    setSkipCountdown(4); // 4 second countdown
  };

  // Create a wrapper for submitGuess to handle the loading state
  const handleSubmitGuess = async () => {
    // Only proceed if not already submitting
    if (!isSubmitting) {
      setIsSubmitting(true);
      try {
        await submitGuess();
      } finally {
        // Ensure loading state is reset even if there's an error
        setIsSubmitting(false);
      }
    }
  };

  // Determine if we should show the song title (when time's up or during skip)
  const shouldShowSongTitle = feedback === "Time's up!" || isSkipping;

  

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-2xl">Loading lyrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-2xl text-red-500 mb-4">{error}</div>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }


  const generateHangmanHint = (songTitle: string, level: number): string => {
    const pureTitle = songTitle.replace(/\s/g, '');
    const numLetters = pureTitle.length;
    let revealCount = 0;
    if (numLetters < 5) {
      revealCount = Math.min(level, 1);
    } else {
      revealCount = Math.min(Math.floor(numLetters * 0.2 * level), numLetters);
    }
    let count = 0;
    let hintString = '';
    for (let char of songTitle) {
      if (char === ' ') {
        hintString += '    ';
      } else {
        hintString += count < revealCount ? char : '_';
        count++;
      }
    }
    return hintString;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with game stats */}
      <div className="flex justify-between items-center p-4 bg-gray-800 rounded-lg mb-4">
        <div className="text-xl">
          <span className="text-purple-300 font-bold">Score:</span> {score}
        </div>
        <div className="w-full max-w-sm">
        <ProgressBar current={currentRound} total={totalRounds} />
        </div>
        <CircularTimer timeRemaining={timeRemaining} maxTime={30} />
      </div>

      {/* Main content area */}
      <div className="flex-grow flex flex-col items-center justify-center p-4">
        <AudioVisualizer />

        {/* Lyrics display */}
        <div className="bg-gray-800 p-6 rounded-lg mb-8 max-w-lg w-full">
          <h2 className="text-2xl font-bold mb-4 text-teal-300">Guess the song:</h2>
          <p className="text-xl font-medium whitespace-pre-line">{currentLyrics}</p>
          
          {/* Song Title Reveal - shown when time's up or during skipping */}
          {shouldShowSongTitle && (
            <div className="mt-6 p-3 bg-gray-700 rounded-lg border border-yellow-500 animate-pulse">
              <p className="text-yellow-400 font-bold">Song Title:</p>
              <p className="text-2xl text-white font-bold">{currentSongTitle}</p>
              <p className="text-yellow-400 font-bold mt-2">Artist:</p>
              <p className="text-xl text-white">{currentArtist}</p>
              
              {/* Countdown display for skip transition */}
              {isSkipping && (
                <p className="mt-3 text-center text-teal-300">
                  Next round in {skipCountdown} seconds...
                </p>
              )}
            </div>
          )}
        </div>

        {/* Hint system */}
        <div className="mb-4">
          <div>
            {artistHintRevealed && (
              <div className="text-yellow-300 mb-2">
                <span className="font-bold">Artist:</span> {currentArtist}
              </div>
            )}
            {!artistHintRevealed && !shouldShowSongTitle && (
              <button
                onClick={revealArtistHint}
                className="text-yellow-400 hover:text-yellow-300 underline"
              >
                Show Artist Name (-20 points)
              </button>
            )}
          </div>
          {hintLevel > 0 && !shouldShowSongTitle && (
            <div className="text-green-300 mb-2">
              <span className="font-bold">Title Hint:</span>{' '}
              {generateHangmanHint(currentSongTitle, hintLevel)}
            </div>
          )}
          <div>
            {!shouldShowSongTitle && (
              <button
                onClick={requestHint}
                className="mr-4 text-yellow-400 hover:text-yellow-300 underline"
              >
                More Hint (-30 points)
              </button>
            )}
          </div>
        </div>

        {/* Feedback */}
        {feedback && !isSkipping && (
          <div
            className={`mb-4 text-2xl ${
              feedback === 'Correct!' ? 'text-green-500' : 
              feedback === "Time's up!" ? 'text-yellow-500' : 
              'text-red-500'
            }`}
          >
            {feedback}
          </div>
        )}
        
        {/* Skip feedback - only shown when actively skipping */}
        {isSkipping && (
          <div className="mb-4 text-2xl text-yellow-500">
            Round skipped!
          </div>
        )}

        {/* Guess input */}
        <div className="w-full max-w-lg">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="Enter song title..."
            className="w-full p-4 text-lg bg-gray-700 rounded-lg mb-4 text-white"
            disabled={shouldShowSongTitle}
          />
          <div className="flex space-x-4">
            <button
              onClick={handleSubmitGuess}
              disabled={guess.trim() === '' || shouldShowSongTitle || isSubmitting}
              className="flex-1 px-6 py-3 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:bg-gray-500 relative"
            >
              {isSubmitting ? (
                <>
                  <span className="opacity-0">Check Answer</span>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                </>
              ) : (
                "Check Answer"
              )}
            </button>
            <button
              onClick={handleSkip}
              className="flex-1 px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700"
              disabled={isSkipping || feedback === "Time's up!"}
            >
              Skip Round
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;