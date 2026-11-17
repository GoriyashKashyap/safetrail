import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import Banner from '../components/ui/Banner.jsx';
import { Spinner } from '../components/ui/Loading.jsx';
import api, { apiError } from '../services/api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
    } catch (err) {
      setError(apiError(err, 'Could not send the reset email.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link that's valid for one hour."
      footer={
        <Link to="/login" className="text-shield-600 font-semibold hover:underline">
          Back to sign in
        </Link>
      }
    >
      {message ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <span className="w-12 h-12 rounded-2xl bg-safe-50 text-safe-600 flex items-center justify-center">
              <MailCheck className="w-6 h-6" />
            </span>
            <p className="text-sm text-slate-600">{message}</p>
            <p className="text-xs text-slate-400">
              No email? Check spam, or confirm the address you signed up with.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Banner tone="error">{error}</Banner>}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
            {busy && <Spinner className="w-4 h-4" />}
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
