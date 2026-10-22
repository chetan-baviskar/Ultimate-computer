import React from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Home, AlertCircle, Monitor } from 'lucide-react';

export const NotFound = ({ setActivePage }) => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-6">
      <div className="w-20 h-20 rounded-3xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mx-auto mb-4 shadow-xl">
        <Monitor className="w-10 h-10" />
      </div>

      <Badge variant="amber" className="mx-auto flex items-center gap-1.5 w-fit">
        <AlertCircle className="w-4 h-4" /> 404 Error
      </Badge>

      <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight">
        Page Not Found
      </h1>

      <p className="text-base text-slate-400 max-w-md mx-auto leading-relaxed">
        The page or resource you are looking for does not exist or may have been moved. Please return to the Ultimate Computer home page.
      </p>

      <div className="pt-4">
        <Button
          variant="primary"
          size="lg"
          icon={Home}
          onClick={() => {
            if (setActivePage) setActivePage('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
};
