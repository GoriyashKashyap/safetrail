import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3">
      <span className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
        <Compass className="w-7 h-7" />
      </span>
      <h1 className="font-display text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-500 max-w-sm">
        That link doesn't take you anywhere. Head back to your dashboard to keep travelling safely.
      </p>
      <Link to="/" className="btn-primary mt-1">
        Back to dashboard
      </Link>
    </div>
  );
}
