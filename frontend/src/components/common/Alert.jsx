import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

const VARIANTS = {
  error: {
    container: 'bg-red-50 border-red-200 text-red-800',
    icon: <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />,
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
  },
  success: {
    container: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
  },
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />,
  },
};

export const Alert = ({ variant = 'info', title, message, children, onClose, className = '' }) => {
  const currentVariant = VARIANTS[variant] || VARIANTS.info;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-3.5 rounded-lg border text-sm backdrop-blur-sm transition-all animate-fadeIn ${currentVariant.container} ${className}`}
    >
      {currentVariant.icon}
      <div className="flex-1 space-y-0.5">
        {title && <p className="font-semibold leading-snug">{title}</p>}
        {message && <p className="text-xs sm:text-sm opacity-90 leading-relaxed">{message}</p>}
        {children}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss alert"
          className="p-1 rounded hover:bg-black/5 opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default Alert;
