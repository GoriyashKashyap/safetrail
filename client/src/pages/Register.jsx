import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import Banner from '../components/ui/Banner.jsx';
import { Spinner } from '../components/ui/Loading.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../services/api.js';

export default function Register() {
  const { register, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && isAuthenticated) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { name: form.name, email: form.email, password: form.password };
      if (form.phone.trim()) payload.phone = form.phone.trim();
      await register(payload);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err, 'Could not create your account.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your safety circle in under a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-shield-600 font-semibold hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Banner tone="error">{error}</Banner>}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Full name
          </label>
          <input
            id="name"
            required
            minLength={2}
            maxLength={60}
            className="input"
            placeholder="Aarav Sharma"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1.5">
            Phone <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            className="input"
            placeholder="+919876543210"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <p className="text-xs text-slate-400 mt-1">Include the country code, e.g. +91…</p>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              className="input pr-11"
              placeholder="At least 8 characters, 1 number"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
          {busy && <Spinner className="w-4 h-4" />}
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-xs text-slate-400 text-center leading-relaxed">
          We'll email you a verification link. You can start using SafeTrail right away.
        </p>
      </form>
    </AuthLayout>
  );
}
