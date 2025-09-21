
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ children, className, variant = 'primary', ...props }) => {
  const baseClasses = "px-8 py-3 text-lg font-semibold rounded-md transition-all duration-300 focus:outline-none focus:ring-4 transform hover:scale-105";
  
  const variantClasses = {
    primary: "bg-cyan-500 text-slate-900 hover:bg-cyan-400 focus:ring-cyan-500/50 shadow-lg shadow-cyan-500/20",
    secondary: "bg-slate-700 text-white hover:bg-slate-600 focus:ring-slate-500/50"
  };

  return (
    <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};
