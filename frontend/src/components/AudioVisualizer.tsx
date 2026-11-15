import React, { useState, useEffect } from 'react';

const AudioVisualizer: React.FC = () => {
  const [bars, setBars] = useState<number[]>([]);
  
  // Generate random values for visualizer bars
  useEffect(() => {
    // Generate initial bars
    const generateBars = () => {
      return Array.from({ length: 20 }, () => Math.floor(Math.random() * 60) + 10);
    };
    
    setBars(generateBars());
    
    // Update bars periodically for animation effect
    const interval = setInterval(() => {
      setBars(prev => 
        prev.map(height => {
          // Randomly adjust height up or down, keeping within bounds
          const adjustment = Math.floor(Math.random() * 20) - 10;
          const newHeight = Math.max(10, Math.min(80, height + adjustment));
          return newHeight;
        })
      );
    }, 200);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="w-full max-w-lg flex items-end justify-center h-16 mb-6">
      {bars.map((height, index) => (
        <div 
          key={index} 
          className="w-2 mx-0.5 bg-gradient-to-t from-purple-600 to-teal-300" 
          style={{ height: `${height}%` }}
        ></div>
      ))}
    </div>
  );
};

export default AudioVisualizer;