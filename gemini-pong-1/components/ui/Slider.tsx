import React from 'react';

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: number[]) => void;
  value?: number;
}

export const Slider: React.FC<SliderProps> = ({ className, onValueChange, value, ...props }) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (onValueChange) {
      onValueChange([Number(event.target.value)]);
    }
  };

  return (
    <input
      type="range"
      value={value}
      onChange={handleChange}
      className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
        [&::-webkit-slider-thumb]:appearance-none
        [&::-webkit-slider-thumb]:h-5
        [&::-webkit-slider-thumb]:w-5
        [&::-webkit-slider-thumb]:rounded-full
        [&::-webkit-slider-thumb]:bg-cyan-500
        [&::-webkit-slider-thumb]:shadow-md
        [&::-webkit-slider-thumb]:shadow-cyan-500/30
        [&::-webkit-slider-thumb]:cursor-pointer
        
        [&::-moz-range-thumb]:h-5
        [&::-moz-range-thumb]:w-5
        [&::-moz-range-thumb]:rounded-full
        [&::-moz-range-thumb]:bg-cyan-500
        [&::-moz-range-thumb]:border-none
        [&::-moz-range-thumb]:cursor-pointer
        
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500
        ${className}`}
      {...props}
    />
  );
};