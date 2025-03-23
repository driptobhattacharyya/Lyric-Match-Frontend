import React from 'react';

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  fullWidth?: boolean;
  className?: string;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  onClick, 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  className = '',
  disabled = false
}) => {
  // Base styles
  const baseStyles = "font-bold py-3 px-6 rounded-lg transition transform hover:scale-105";
  
  // Variant styles
  const variantStyles = {
    primary: "bg-purple-600 hover:bg-purple-700 text-white",
    secondary: "bg-teal-600 hover:bg-teal-700 text-white"
  };
  
  // Width styles
  const widthStyles = fullWidth ? "w-full" : "";
  
  // Disabled styles
  const disabledStyles = disabled ? "opacity-50 cursor-not-allowed" : "";
  
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${widthStyles} ${disabledStyles} ${className}`}
    >
      {children}
    </button>
  );
};

export default Button;