import { Loader2, Shield } from 'lucide-react';

export function Spinner({ className = 'w-5 h-5' }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner className="w-7 h-7 text-shield-600" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon = Shield, title, description, action }) {
  return (
    <div className="card p-10 text-center flex flex-col items-center gap-3">
      <span className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center">
        <Icon className="w-6 h-6" />
      </span>
      <div>
        <h3 className="font-display font-semibold text-slate-900">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export default PageLoader;
