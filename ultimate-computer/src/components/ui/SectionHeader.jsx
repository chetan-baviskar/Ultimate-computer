import React from 'react';

export const SectionHeader = ({
  badge,
  title,
  subtitle,
  align = "center",
  className = ""
}) => {
  const alignmentClass = align === "left" ? "text-left items-start" : "text-center items-center";

  return (
    <div className={`flex flex-col mb-12 sm:mb-16 ${alignmentClass} ${className}`}>
      {badge && (
        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold tracking-wide uppercase rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
          {badge}
        </span>
      )}
      {title && (
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white max-w-3xl leading-tight">
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="mt-4 text-base sm:text-lg text-slate-400 max-w-2xl font-normal leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
};
