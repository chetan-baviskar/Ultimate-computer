import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';

/**
 * Minimal left-arrow control shown at the top-left of every inner page.
 *
 * It reuses the app's existing hash based navigation, so it:
 *  - goes to the previous page of this website when there is one,
 *  - falls back to the Home page when the visitor landed directly on this
 *    page (it never leaves the website),
 *  - and keeps working with the browser Back / Forward buttons.
 */
export const BackArrow = ({ className = '' }) => {
  const { goBack } = useNavigation();

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Go Back"
      className={`group relative inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 transition-colors duration-200 ${className}`}
    >
      <ArrowLeft
        className="w-5 h-5 transition-transform duration-200 group-hover:-translate-x-0.5"
        aria-hidden="true"
      />

      {/* Tooltip */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-700/80 bg-slate-900 px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-200 shadow-lg opacity-0 scale-95 transition-all duration-200 group-hover:opacity-100 group-hover:scale-100"
      >
        Go Back
      </span>
    </button>
  );
};

export default BackArrow;
