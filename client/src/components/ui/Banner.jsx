import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const TONES = {
  error: {
    wrap: 'bg-red-50 border-red-200 text-red-800',
    Icon: AlertCircle,
    icon: 'text-danger-500',
  },
  success: {
    wrap: 'bg-safe-50 border-safe-400/30 text-safe-700',
    Icon: CheckCircle2,
    icon: 'text-safe-600',
  },
  warning: {
    wrap: 'bg-warn-50 border-warn-400/40 text-amber-800',
    Icon: AlertCircle,
    icon: 'text-warn-500',
  },
  info: {
    wrap: 'bg-shield-50 border-shield-400/30 text-shield-900',
    Icon: Info,
    icon: 'text-shield-600',
  },
};

export default function Banner({ tone = 'info', children, onDismiss, className = '' }) {
  const { wrap, Icon, icon } = TONES[tone] || TONES.info;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${wrap} ${className}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${icon}`} />
      <div className="flex-1 leading-relaxed">{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
