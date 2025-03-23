import { LyricData } from '../types';

// Base URL for your Flask API
const API_URL = 'http://localhost:5000'; // Change this to your actual API URL

// Get a random lyric snippet
export const fetchLyricSnippet = async (): Promise<LyricData> => {
  try {
    const response = await fetch(`${API_URL}/api/lyrics`);
    if (!response.ok) {
      throw new Error('Failed to fetch lyrics');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching lyrics:', error);
    throw error;
  }
};

// Check if the user's guess is correct
export const checkGuess = (userGuess: string, actualSong: string): boolean => {
  // Simple case-insensitive comparison
  // You can make this more sophisticated with fuzzy matching if needed
  return userGuess.trim().toLowerCase() === actualSong.trim().toLowerCase();
};