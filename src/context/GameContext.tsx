import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { GameState, RoundResult, LyricData } from '../types';
import { fetchLyricSnippet, checkGuess } from '../services/api';

interface GameContextType {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  currentRound: number;
  totalRounds: number;
  timeRemaining: number;
  score: number;
  currentLyrics: string;
  currentSongTitle: string;
  currentArtist: string;
  guess: string;
  setGuess: (guess: string) => void;
  hintLevel: number;
  requestHint: () => void;
  feedback: string | null;
  results: RoundResult[];
  startGame: () => void;
  submitGuess: () => void;
  skipRound: () => void;
  resetGame: () => void;
  isLoading: boolean;
  error: string | null;
  artistHintRevealed: boolean;
  revealArtistHint: () => void;  // Uncomment this line
  deductScore: (points: number) => void;
  setArtistHintRevealed: React.Dispatch<React.SetStateAction<boolean>>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Game state
  const [gameState, setGameState] = useState<GameState>('welcome');
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds] = useState(5);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [score, setScore] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  

  // Current question data
  const [currentLyrics, setCurrentLyrics] = useState('');
  const [currentSongTitle, setCurrentSongTitle] = useState('');
  const [currentArtist, setCurrentArtist] = useState('');
  const [guess, setGuess] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [artistHintRevealed, setArtistHintRevealed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Results
  const [results, setResults] = useState<RoundResult[]>([]);

  // API state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timer effect
  useEffect(() => {
    let timer;
    if (isTimerActive && timeRemaining > 0) {
      timer = setInterval(() => setTimeRemaining(prev => prev - 1), 1000);
    } else if (timeRemaining === 0 && isTimerActive) {
      setIsTimerActive(false);
      const roundResult = {
        round: currentRound,
        song: currentSongTitle,
        artist: currentArtist,
        correct: false,
        timeUsed: 30,
        points: 0,
        hintsUsed: hintLevel,
      };
      setResults(prev => [...prev, roundResult]);
      setFeedback("Time's up!");
      setTimeout(() => {
        setFeedback(null);
        if (currentRound < totalRounds) {
          setCurrentRound(prev => prev + 1);
          startNewRound();
        } else {
          setGameState('results');
        }
      }, 4000);
    }
    return () => clearInterval(timer);
  }, [timeRemaining, isTimerActive, currentRound, totalRounds]);



  // Fetch new lyric snippet
  const fetchNewLyric = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data: LyricData = await fetchLyricSnippet();
      setCurrentLyrics(data.lyrics);
      setCurrentSongTitle(data.song);
      setCurrentArtist(data.artist);
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
      setError('Failed to fetch lyrics. Please try again.');
      console.error('Error fetching lyrics:', err);
    }
  };

  // Start a new game
  const startGame = async () => {
    setGameState('playing');
    setCurrentRound(1);
    setScore(0);
    setResults([]);
    await startNewRound();
  };

  // Start a new round
  const startNewRound = async () => {
    setTimeRemaining(30);
    setGuess('');
    setHintLevel(0);
    setFeedback(null);
    await fetchNewLyric();
    setIsTimerActive(true);
    setArtistHintRevealed(false);
  };

  // Calculate points
  const calculatePoints = (correct: boolean, timeUsed: number, hintsUsed: number): number => {
    if (!correct) return 0;
    const basePoints = 100;
    const timeBonus = Math.round((30 - timeUsed) * 5); // 5 points per second remaining
    const hintPenalty = hintsUsed * 30; // 30 points per hint
    return Math.max(basePoints + timeBonus - hintPenalty, 0);
  };

  // Submit user's guess
  const submitGuess = async () => {
    const isCorrect = await checkGuess(guess, currentSongTitle);
    console.log("Is it correct", isCorrect)
    if (isCorrect) {
      setIsTimerActive(false); // Stop the timer
      const timeUsed = 30 - timeRemaining;
      const pointsEarned = calculatePoints(true, timeUsed, hintLevel);
      setScore(prev => prev + pointsEarned);
      setFeedback('Correct!');
      const roundResult = {
        round: currentRound,
        song: currentSongTitle,
        artist: currentArtist,
        correct: true,
        timeUsed,
        points: pointsEarned,
        hintsUsed: hintLevel,
      };
      setResults(prev => [...prev, roundResult]);
      setTimeout(() => {
        setFeedback(null);
        if (currentRound < totalRounds) {
          setCurrentRound(prev => prev + 1);
          startNewRound();
        } else {
          setGameState('results');
        }
      }, 2000);
    } else {
      setFeedback('Wrong! Try again.');
      setTimeout(() => setFeedback(null), 2000); // Clear feedback, stay in round
    }
    setGuess(''); // Clear input after each guess
  };

  // Request a hint
  const requestHint = () => {
    setHintLevel((prev) => prev + 1);
  };

  // Skip the current round
  const skipRound = () => {
    setIsTimerActive(false);
    const timeUsed = 30 - timeRemaining;
    const roundResult: RoundResult = {
      round: currentRound,
      song: currentSongTitle,
      artist: currentArtist,
      correct: false,
      timeUsed,
      points: 0,
      hintsUsed: hintLevel,
    };
    setResults((prev) => [...prev, roundResult]);

    if (currentRound < totalRounds) {
      setCurrentRound((prev) => prev + 1);
      startNewRound();
    } else {
      setGameState('results');
    }
  };

  // Reset game
  const resetGame = () => {
    setGameState('welcome');
    setCurrentRound(1);
    setScore(0);
    setTimeRemaining(30);
    setIsTimerActive(false);
    setGuess('');
    setHintLevel(0);
    setFeedback(null);
    setResults([]);
  };

  const deductScore = (points) => {
    setScore(prev => Math.max(prev - points, 0)); // Prevent negative score
  };

  // Function to reveal the artist hint
  const revealArtistHint = () => {
    if (!artistHintRevealed) {
      setArtistHintRevealed(true);
      deductScore(20); // Deduct 20 points
    }
  };

  const value = {
    gameState,
    setGameState,
    currentRound,
    totalRounds,
    timeRemaining,
    score,
    currentLyrics,
    currentSongTitle,
    currentArtist,
    guess,
    setGuess,
    hintLevel,
    requestHint,
    feedback,
    results,
    startGame,
    submitGuess,
    skipRound,
    resetGame,
    isLoading,
    error,
    artistHintRevealed,  // This was missing
    deductScore,
    setArtistHintRevealed,
    revealArtistHint,    // Add this function to the context
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};