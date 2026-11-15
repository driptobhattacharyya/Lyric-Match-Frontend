import React from 'react';

interface CircularTimerProps {
  timeRemaining: number;
  maxTime: number;
}

const CircularTimer: React.FC<CircularTimerProps> = ({ timeRemaining, maxTime }) => {
  // Calculate the circumference of the circle
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  
  // Calculate the dash offset based on remaining time
  const dashOffset = circumference * (1 - timeRemaining / maxTime);
  
  // Determine color based on time remaining
  const getTimerColor = () => {
    if (timeRemaining <= 5) return 'text-red-500';
    if (timeRemaining <= 10) return 'text-yellow-500';
    return 'text-purple-500';
  };
  
  return (
    <div className="relative h-16 w-16">
      <svg className="h-full w-full" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle 
          className="text-gray-700" 
          strokeWidth="8" 
          stroke="currentColor" 
          fill="transparent" 
          r={radius} 
          cx="50" 
          cy="50" 
        />
        {/* Timer progress circle */}
        <circle 
          className={getTimerColor()} 
          strokeWidth="8" 
          stroke="currentColor" 
          fill="transparent" 
          r={radius} 
          cx="50" 
          cy="50" 
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      {/* Timer text */}
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <span className="text-xl font-semibold">{timeRemaining}</span>
      </div>
    </div>
  );
};

export default CircularTimer;