import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import { Spinner } from '../components/ui/Loading.jsx';
import api, { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function AcceptGuardian() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState({ status: 'loading', message: '', travellerName: '' });

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setState({ status: 'error', message: 'This invite link has no token.' });
      return undefined;
    }

    api
      .get('/guardians/accept', { params: { token } })
      .then(({ data }) => {
        if (!cancelled) {
          setState({ status: 'success', message: data.message, travellerName: data.travellerName });
        }
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: apiError(err, 'Could not accept the invite.') });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const nextStep = isAuthenticated ? (
    <Link to="/watching" className="btn-primary mt-1">
      View trips you're watching
    </Link>
  ) : (
    <div className="flex flex-col sm:flex-row gap-2 mt-1">
      <Link to="/login" className="btn-primary">
        Sign in to watch
      </Link>
      <Link to="/register" className="btn-ghost border border-slate-200">
        Create an account
      </Link>
    </div>
  );

  return (
    <AuthLayout
      title="Guardian invitation"
      subtitle="Someone wants you to watch over their travels."
      footer={
        <p className="text-xs text-slate-400">
          To see live trips you need a SafeTrail account with the email address that was invited
          {user?.email ? ` (${user.email})` : ''}.
        </p>
      }
    >
      {state.status === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-6 text-slate-500">
          <Spinner className="w-6 h-6 text-shield-600" />
          <p className="text-sm">Accepting your invitation…</p>
        </div>
      )}

      {state.status === 'success' && (
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <span className="w-12 h-12 rounded-2xl bg-safe-50 text-safe-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </span>
          <p className="text-sm text-slate-600">{state.message}</p>
          <p className="text-xs text-slate-400">
            You'll get an alert if {state.travellerName || 'the traveller'} misses a check-in or
            triggers an SOS.
          </p>
          {nextStep}
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <span className="w-12 h-12 rounded-2xl bg-red-50 text-danger-500 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </span>
          <p className="text-sm text-slate-600">{state.message}</p>
          <p className="text-xs text-slate-400">Ask the traveller to send a fresh invite — links last 7 days.</p>
          <Link to="/" className="btn-ghost border border-slate-200 mt-1 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            Go home
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
