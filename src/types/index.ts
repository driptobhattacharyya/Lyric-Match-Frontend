// Game state types
export type GameState = 'welcome' | 'playing' | 'results';

// Results for each round
export interface RoundResult {
  round: number;
  song: string;
  artist: string;
  correct: boolean;
  timeUsed: number;
  points: number;
}

// Lyric data from API
export interface LyricData {
  song: string;
  artist: string;
  lyrics: string;
}