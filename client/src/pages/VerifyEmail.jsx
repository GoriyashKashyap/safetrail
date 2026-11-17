import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import { Spinner } from '../components/ui/Loading.jsx';
import api, { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { isAuthenticated, refreshUser } = useAuth();
  const [state, setState] = useState({ status: 'loading', message: '' });

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setState({ status: 'error', message: 'This link has no verification token.' });
      return undefined;
    }

    api
      .get('/auth/verify-email', { params: { token } })
      .then(({ data }) => {
        if (cancelled) return;
        setState({ status: 'success', message: data.message });
        if (isAuthenticated) refreshUser().catch(() => {});
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: apiError(err, 'Verification failed.') });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthLayout title="Email verification" subtitle="Confirming your SafeTrail account.">
      {state.status === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-6 text-slate-500">
          <Spinner className="w-6 h-6 text-shield-600" />
          <p className="text-sm">Verifying your email…</p>
        </div>
      )}

      {state.status === 'success' && (
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <span className="w-12 h-12 rounded-2xl bg-safe-50 text-safe-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </span>
          <p className="text-sm text-slate-600">{state.message}</p>
          <Link to={isAuthenticated ? '/' : '/login'} className="btn-primary mt-1">
            {isAuthenticated ? 'Go to dashboard' : 'Sign in'}
          </Link>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <span className="w-12 h-12 rounded-2xl bg-red-50 text-danger-500 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </span>
          <p className="text-sm text-slate-600">{state.message}</p>
          <p className="text-xs text-slate-400">
            Verification links expire after 24 hours. Sign in and request a new one from your dashboard.
          </p>
          <Link to={isAuthenticated ? '/' : '/login'} className="btn-primary mt-1">
            {isAuthenticated ? 'Go to dashboard' : 'Sign in'}
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
