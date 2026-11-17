import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

/** Split-screen frame shared by the public auth pages. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-shield-700 via-shield-600 to-shield-900 text-white p-12">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </span>
          <span className="font-display font-bold text-xl">SafeTrail</span>
        </Link>

        <div className="max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight">
            Travel freely. Your people still know where you are.
          </h1>
          <p className="mt-4 text-shield-100 leading-relaxed">
            Check in along the way, share a live map with trusted guardians, and let SafeTrail raise
            the alarm if you miss a check-in.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-shield-100">
            {[
              'Trip timers with automatic overdue alerts',
              'Live location shared only with your guardians',
              'One-tap SOS with coordinates',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-safe-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-shield-200">Your safety, always tracked.</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md page-enter">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <span className="w-9 h-9 rounded-xl bg-shield-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </span>
            <span className="font-display font-bold text-lg text-slate-900">SafeTrail</span>
          </Link>

          <h2 className="font-display text-2xl font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p>}

          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-sm text-slate-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
