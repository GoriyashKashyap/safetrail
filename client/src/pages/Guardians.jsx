import { useCallback, useEffect, useState } from 'react';
import { Mail, Trash2, UserPlus, Users, Clock } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import Banner from '../components/ui/Banner.jsx';
import { EmptyState, PageLoader, Spinner } from '../components/ui/Loading.jsx';

const STATUS_STYLE = {
  active: 'badge-safe',
  pending: 'badge-warn',
  declined: 'bg-slate-100 text-slate-500',
  removed: 'bg-slate-100 text-slate-400',
};

const displayName = (guardian) =>
  guardian.guardianUser?.name || guardian.guestName || guardian.guestEmail || 'Guardian';

export default function Guardians() {
  const [guardians, setGuardians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [invite, setInvite] = useState({ email: '', label: '', name: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/guardians');
      setGuardians(data.guardians || []);
      setError('');
    } catch (err) {
      setError(apiError(err, 'Could not load your guardians.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitInvite = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const { data } = await api.post('/guardians/invite', {
        email: invite.email,
        label: invite.label.trim() || undefined,
        name: invite.name.trim() || undefined,
      });
      setFeedback({ tone: 'success', text: data.message });
      setInvite({ email: '', label: '', name: '' });
      await load();
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not send the invitation.') });
    } finally {
      setBusy(false);
    }
  };

  const removeGuardian = async (guardian) => {
    if (!window.confirm(`Remove ${displayName(guardian)} from your guardians?`)) return;
    setFeedback(null);
    try {
      await api.delete(`/guardians/${guardian._id}`);
      setGuardians((current) => current.filter((item) => item._id !== guardian._id));
      setFeedback({ tone: 'success', text: 'Guardian removed.' });
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not remove the guardian.') });
    }
  };

  if (loading) return <PageLoader label="Loading guardians…" />;

  const activeCount = guardians.filter((g) => ['active', 'pending'].includes(g.status)).length;

  return (
    <div className="space-y-5 page-enter">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Guardians</h1>
        <p className="text-sm text-slate-500 mt-1">
          Up to five people who see your live trips and get alerted if you miss a check-in.
          {activeCount > 0 && ` ${activeCount}/5 used.`}
        </p>
      </div>

      {error && <Banner tone="error">{error}</Banner>}
      {feedback && (
        <Banner tone={feedback.tone} onDismiss={() => setFeedback(null)}>
          {feedback.text}
        </Banner>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2 space-y-3">
          <h2 className="font-display font-semibold text-slate-900">Your safety circle</h2>

          {guardians.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No guardians yet"
              description="Invite a family member or friend so someone knows where you are and that you arrived safely."
            />
          ) : (
            <div className="space-y-2">
              {guardians.map((guardian) => (
                <div key={guardian._id} className="card p-4 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-shield-50 text-shield-700 text-sm font-bold flex items-center justify-center shrink-0">
                    {(guardian.label || 'G').slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900 truncate">{displayName(guardian)}</p>
                      <span className={`${STATUS_STYLE[guardian.status] || STATUS_STYLE.removed} text-[11px]`}>
                        {guardian.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {guardian.label}
                      {guardian.guestEmail || guardian.guardianUser?.email
                        ? ` · ${guardian.guestEmail || guardian.guardianUser?.email}`
                        : ''}
                    </p>
                    {guardian.status === 'pending' && (
                      <p className="text-xs text-warn-500 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Invite sent — waiting for them to accept.
                      </p>
                    )}
                  </div>
                  {guardian.status !== 'removed' && (
                    <button
                      onClick={() => removeGuardian(guardian)}
                      className="btn-ghost !px-2 text-slate-400 hover:text-danger-500"
                      aria-label={`Remove ${displayName(guardian)}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside>
          <h2 className="font-display font-semibold text-slate-900 mb-3">Invite a guardian</h2>
          <form onSubmit={submitInvite} className="card p-5 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                className="input"
                placeholder="mom@example.com"
                value={invite.email}
                onChange={(event) => setInvite({ ...invite, email: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="label" className="block text-sm font-medium text-slate-700 mb-1.5">
                Label <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="label"
                maxLength={30}
                className="input"
                placeholder="Mom"
                value={invite.label}
                onChange={(event) => setInvite({ ...invite, label: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">
                Their name <span className="text-slate-400 font-normal">(if they have no account)</span>
              </label>
              <input
                id="name"
                maxLength={60}
                className="input"
                placeholder="Sunita Sharma"
                value={invite.name}
                onChange={(event) => setInvite({ ...invite, name: event.target.value })}
              />
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full flex items-center justify-center gap-1.5">
              {busy ? <Spinner className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {busy ? 'Sending…' : 'Send invitation'}
            </button>

            <p className="text-xs text-slate-400 flex items-start gap-1.5">
              <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              We email them a link to accept. Invitations expire after 7 days.
            </p>
          </form>
        </aside>
      </div>
    </div>
  );
}
