
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className }) => {
  return (
    <div className={`bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-xl p-8 text-center flex flex-col items-center shadow-2xl ${className}`}>
      {children}
    </div>
  );
};
