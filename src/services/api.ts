import { LyricData } from '../types';

// Base URL for your Flask API
const API_URL = 'https://idx-lyricsmatchbackend-571547-stnmuaymsa-ue.a.run.app';

// Get a random lyric snippet
export const fetchLyricSnippet = async (): Promise<LyricData> => {
  try {
    const response = await fetch(`${API_URL}/genai/generate-lyrics`);
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
export const checkGuess = async (userGuess: string, actualSong: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/checking/check-lyrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userGuess, actualSong }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('API Response:', data);

    return data.message === 'Correct';
  } catch (error) {
    console.error('Error checking guess:', error);
    throw error;
  }
};