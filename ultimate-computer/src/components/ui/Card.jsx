import React from 'react';

export const Card = ({ children, className = "", hover = true, ...props }) => {
  return (
    <div
      className={`glass-panel rounded-2xl p-6 relative overflow-hidden transition-all duration-300 ${
        hover ? 'glass-panel-hover' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
