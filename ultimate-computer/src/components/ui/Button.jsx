import React from 'react';

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconPosition = "right",
  className = "",
  type = "button",
  onClick,
  disabled = false,
  ...props
}) => {
  const baseStyle = "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

  const sizes = {
    sm: "px-3.5 py-1.5 text-xs gap-1.5",
    md: "px-5 py-2.5 text-sm gap-2",
    lg: "px-7 py-3.5 text-base gap-2.5 font-semibold",
    xl: "px-8 py-4 text-lg gap-3 font-semibold"
  };

  const variants = {
    primary: "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-lg shadow-blue-500/25 border border-blue-400/20 focus:ring-blue-500",
    secondary: "bg-slate-800/90 hover:bg-slate-700 text-slate-100 border border-slate-700/80 shadow-md focus:ring-slate-500",
    outline: "bg-transparent hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-400 focus:ring-blue-500",
    ghost: "bg-transparent hover:bg-slate-800/80 text-slate-300 hover:text-white focus:ring-slate-500",
    danger: "bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-500/20 focus:ring-red-500"
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {Icon && iconPosition === "left" && <Icon className="w-4 h-4 shrink-0" />}
      {children}
      {Icon && iconPosition === "right" && <Icon className="w-4 h-4 shrink-0" />}
    </button>
  );
};
