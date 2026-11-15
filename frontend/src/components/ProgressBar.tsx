import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const progressPercentage = (current / total) * 100;
  console.log("ProgressBar values - Current:", current, "Total:", total);

  return (
    <div className="flex items-center">
      <div className="w-full bg-gray-200 rounded-full h-2.5 mr-3">
        <div 
          className="bg-purple-600 h-2.5 rounded-full duration-500" 
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>
      <span className="text-lg">{current}/{total}</span>
    </div>
  );
};

export default ProgressBar;