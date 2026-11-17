import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, MailWarning, MessageCircle, Save, Send, UserRound } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Banner from '../components/ui/Banner.jsx';
import { Spinner } from '../components/ui/Loading.jsx';

export default function Settings() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
  });
  const [settings, setSettings] = useState({
    defaultCheckInInterval: user?.settings?.defaultCheckInInterval ?? 30,
    alertBuffer: user?.settings?.alertBuffer ?? 10,
    notifyByEmail: user?.settings?.notifyByEmail ?? true,
    notifyBySMS: user?.settings?.notifyBySMS ?? true,
    notifyByPush: user?.settings?.notifyByPush ?? true,
    notifyByTelegram: user?.settings?.notifyByTelegram ?? true,
  });
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [notice, setNotice] = useState('');
  const [resending, setResending] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState('');
  const [telegramLink, setTelegramLink] = useState(null);
  const [telegramStatus, setTelegramStatus] = useState(null);

  // Server-side truth about the bot: commands are only delivered when Telegram
  // can reach the API, which the client cannot know on its own.
  const loadTelegramStatus = async () => {
    try {
      const { data } = await api.get('/telegram/status');
      setTelegramStatus(data);
    } catch {
      setTelegramStatus(null);
    }
  };

  useEffect(() => {
    loadTelegramStatus();
  }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy('profile');
    setFeedback(null);
    try {
      const payload = { name: profile.name.trim() };
      if (profile.phone.trim()) payload.phone = profile.phone.trim();
      const { data } = await api.patch('/auth/update-profile', payload);
      await refreshUser();
      setProfile({ name: data.user.name || '', phone: data.user.phone || '' });
      setFeedback({ tone: 'success', text: data.message });
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not save your profile.') });
    } finally {
      setBusy('');
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setBusy('settings');
    setFeedback(null);
    try {
      await api.patch('/auth/update-profile', { settings });
      await refreshUser();
      setFeedback({ tone: 'success', text: 'Preferences saved.' });
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not save your preferences.') });
    } finally {
      setBusy('');
    }
  };

  const resendVerification = async () => {
    setResending(true);
    setNotice('');
    try {
      const { data } = await api.post('/auth/resend-verification');
      setNotice(data.message);
    } catch (err) {
      setNotice(apiError(err, 'Could not resend the verification email.'));
    } finally {
      setResending(false);
    }
  };

  const connectTelegram = async () => {
    setTelegramBusy('connect');
    setFeedback(null);
    try {
      const { data } = await api.get('/telegram/link');
      setTelegramLink(data);
      window.open(data.deepLink, '_blank', 'noopener,noreferrer');
      setNotice(`Press Start in Telegram (@${data.botUsername}) to finish connecting.`);
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not create a Telegram link.') });
    } finally {
      setTelegramBusy('');
    }
  };

  const refreshTelegram = async () => {
    setTelegramBusy('refresh');
    try {
      await refreshUser();
      await loadTelegramStatus();
      setNotice('Telegram status refreshed.');
    } finally {
      setTelegramBusy('');
    }
  };

  const sendTelegramTest = async () => {
    setTelegramBusy('test');
    setFeedback(null);
    try {
      const { data } = await api.post('/telegram/test');
      setFeedback({ tone: 'success', text: data.message });
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not send the test message.') });
    } finally {
      setTelegramBusy('');
      loadTelegramStatus();
    }
  };

  const disconnectTelegram = async () => {
    setTelegramBusy('disconnect');
    setFeedback(null);
    try {
      await api.delete('/telegram/link');
      await refreshUser();
      setTelegramLink(null);
      setFeedback({ tone: 'success', text: 'Telegram disconnected. You will no longer get alerts there.' });
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not disconnect Telegram.') });
    } finally {
      setTelegramBusy('');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 page-enter">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Your profile and safety preferences.</p>
      </div>

      {feedback && (
        <Banner tone={feedback.tone} onDismiss={() => setFeedback(null)}>
          {feedback.text}
        </Banner>
      )}
      {notice && <Banner tone="info" onDismiss={() => setNotice('')}>{notice}</Banner>}

      {user && !user.isVerified && (
        <Banner tone="warning">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="flex items-center gap-1.5 font-medium">
              <MailWarning className="w-4 h-4" />
              Email not verified.
            </span>
            <button
              onClick={resendVerification}
              disabled={resending}
              className="font-semibold text-shield-700 underline disabled:opacity-50"
            >
              {resending ? 'Sending…' : 'Resend email'}
            </button>
          </div>
        </Banner>
      )}

      <form onSubmit={saveProfile} className="card p-6 space-y-4">
        <h2 className="font-display font-semibold text-slate-900 flex items-center gap-2">
          <UserRound className="w-4 h-4 text-slate-400" />
          Profile
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Name
            </label>
            <input
              id="name"
              required
              minLength={2}
              maxLength={60}
              className="input"
              value={profile.name}
              onChange={(event) => setProfile({ ...profile, name: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1.5">
              Phone
            </label>
            <input
              id="phone"
              className="input"
              placeholder="+919876543210"
              value={profile.phone}
              onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
            />
          </div>
        </div>

        <div>
          <p className="text-sm text-slate-500">Email</p>
          <p className="text-sm font-medium text-slate-800">{user?.email}</p>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={busy === 'profile'} className="btn-primary flex items-center gap-1.5">
            {busy === 'profile' ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save profile
          </button>
        </div>
      </form>

      <form onSubmit={saveSettings} className="card p-6 space-y-4">
        <h2 className="font-display font-semibold text-slate-900">Safety preferences</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="interval" className="block text-sm font-medium text-slate-700 mb-1.5">
              Default check-in interval
            </label>
            <select
              id="interval"
              className="input"
              value={settings.defaultCheckInInterval}
              onChange={(event) =>
                setSettings({ ...settings, defaultCheckInInterval: Number(event.target.value) })
              }
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>
          <div>
            <label htmlFor="buffer" className="block text-sm font-medium text-slate-700 mb-1.5">
              Alert buffer (minutes)
            </label>
            <input
              id="buffer"
              type="number"
              min={0}
              max={120}
              className="input"
              value={settings.alertBuffer}
              onChange={(event) => setSettings({ ...settings, alertBuffer: Number(event.target.value) })}
            />
            <p className="text-xs text-slate-400 mt-1">Stored with your profile for future alert tuning.</p>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          {[
            { key: 'notifyByEmail', label: 'Email notifications' },
            { key: 'notifyBySMS', label: 'SMS notifications (not yet delivered)' },
            { key: 'notifyByTelegram', label: 'Telegram notifications' },
            { key: 'notifyByPush', label: 'Push notifications (not yet delivered)' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-shield-600"
                checked={settings[key]}
                onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={busy === 'settings'} className="btn-primary flex items-center gap-1.5">
            {busy === 'settings' ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save preferences
          </button>
        </div>
      </form>

      <div className="card p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-slate-900 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-slate-400" />
              Telegram
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              SOS alerts, missed check-ins and live map pins arrive in a chat — nothing to install.
            </p>
          </div>
          <span
            className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
              user?.telegramChatId
                ? 'bg-safe-50 text-safe-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {user?.telegramChatId ? 'Connected' : 'Not connected'}
          </span>
        </div>

        {user?.telegramChatId ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={sendTelegramTest}
              disabled={telegramBusy === 'test'}
              className="btn-primary flex items-center gap-1.5"
            >
              {telegramBusy === 'test' ? <Spinner className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {telegramBusy === 'test' ? 'Sending…' : 'Send test message'}
            </button>
            <button
              onClick={refreshTelegram}
              disabled={telegramBusy === 'refresh'}
              className="btn-ghost border border-slate-200 flex items-center gap-1.5"
            >
              {telegramBusy === 'refresh' ? <Spinner className="w-4 h-4" /> : null}
              Refresh status
            </button>
            <button
              onClick={disconnectTelegram}
              disabled={telegramBusy === 'disconnect'}
              className="btn-ghost border border-slate-200 text-danger-600 flex items-center gap-1.5"
            >
              {telegramBusy === 'disconnect' ? <Spinner className="w-4 h-4" /> : null}
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={connectTelegram}
              disabled={telegramBusy === 'connect'}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              {telegramBusy === 'connect' ? <Spinner className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
              {telegramBusy === 'connect' ? 'Opening Telegram…' : 'Connect Telegram'}
            </button>

            {telegramLink?.deepLink && (
              <div className="text-sm text-slate-500 space-y-2">
                <p>
                  Telegram didn't open?{' '}
                  <a
                    href={telegramLink.deepLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-shield-600 underline"
                  >
                    Open @{telegramLink.botUsername}
                  </a>{' '}
                  and press Start — the code expires in {telegramLink.expiresInMinutes} minutes.
                </p>
                <p>
                  Still not connected (bot silent or blocked)? Send this message to @
                  {telegramLink.botUsername} instead:{' '}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                    {telegramLink.command}
                  </code>
                </p>
                <button
                  onClick={refreshTelegram}
                  disabled={telegramBusy === 'refresh'}
                  className="btn-ghost border border-slate-200"
                >
                  I've pressed Start
                </button>
              </div>
            )}
          </div>
        )}

        {telegramStatus && (
          <div className="rounded-xl border border-slate-100 p-3 text-xs text-slate-500 space-y-1">
            <p>
              <span className="font-medium text-slate-600">Bot:</span>{' '}
              {telegramStatus.botUsername ? `@${telegramStatus.botUsername}` : 'not reachable'}
            </p>
            <p>
              <span className="font-medium text-slate-600">Commands:</span>{' '}
              {telegramStatus.commands === 'enabled'
                ? 'enabled — /status, /trips, /map and /stop work in the chat'
                : 'disabled — the server has no public URL for Telegram'}
            </p>
            <p>
              <span className="font-medium text-slate-600">Webhook:</span> {telegramStatus.webhook}
              {telegramStatus.pendingUpdates > 0 ? ` · ${telegramStatus.pendingUpdates} queued` : ''}
            </p>
            {telegramStatus.lastError && (
              <p className="text-amber-700">Telegram last error: {telegramStatus.lastError}</p>
            )}
          </div>
        )}

        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-600">Inside the chat</p>
          <p>
            /status — live trips and check-in state · /map — latest positions · /trips — history ·
            /stop — stop alerts
          </p>
        </div>
      </div>

      <div className="card p-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-slate-800">Sign out</p>
          <p className="text-sm text-slate-500">You'll need your password to sign back in.</p>
        </div>
        <button onClick={handleLogout} className="btn-ghost border border-slate-200 flex items-center gap-1.5">
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
