import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import Banner from '../components/ui/Banner.jsx';
import { Spinner } from '../components/ui/Loading.jsx';
import api, { apiError } from '../services/api.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      setDone(true);
    } catch (err) {
      setError(apiError(err, 'Could not reset your password.'));
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title="Reset link missing" subtitle="This page needs a valid reset token.">
        <Banner tone="error">No reset token was found in the link. Request a new one.</Banner>
        <Link to="/forgot-password" className="btn-primary inline-flex mt-4">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You can now sign in with your new password.">
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <span className="w-12 h-12 rounded-2xl bg-safe-50 text-safe-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </span>
          <p className="text-sm text-slate-600">Your password has been reset successfully.</p>
          <Link to="/login" className="btn-primary mt-1">
            Sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Use at least 8 characters with one number."
      footer={
        <Link to="/forgot-password" className="text-shield-600 font-semibold hover:underline">
          Request a new link
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            className="input"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
          {busy && <Spinner className="w-4 h-4" />}
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  );
}
