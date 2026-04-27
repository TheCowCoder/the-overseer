import { ButtonHTMLAttributes } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'player';
  playerColor?: string;
}

export const Button = ({ children, variant = 'primary', className, playerColor, ...props }: ButtonProps) => {
  const baseStyle = "relative w-full rounded-2xl px-4 py-4 font-extrabold uppercase tracking-widest text-center transition-all active:translate-y-1 active:border-b-0 border-b-4 disabled:opacity-50 disabled:active:translate-y-0 disabled:active:border-b-4";
  
  let variantStyle = "";
  if (variant === 'primary') variantStyle = "bg-duo-green text-white border-duo-green-dark";
  if (variant === 'secondary') variantStyle = "bg-duo-blue text-white border-duo-blue-dark";
  if (variant === 'danger') variantStyle = "bg-duo-red text-white border-duo-red-dark";
  if (variant === 'ghost') variantStyle = "bg-white text-gray-500 border-gray-200 active:border-none";
  if (variant === 'player' && playerColor) {
    variantStyle = "text-white";
  }

  return (
    <button 
      className={cn(baseStyle, variantStyle, className)} 
      style={variant === 'player' ? { backgroundColor: playerColor, borderColor: 'rgba(0,0,0,0.2)' } : undefined}
      {...props}
    >
      {children}
    </button>
  );
};