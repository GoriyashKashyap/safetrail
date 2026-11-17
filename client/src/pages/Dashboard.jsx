import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  MailWarning,
  MapPin,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react';
import api, { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Banner from '../components/ui/Banner.jsx';
import Countdown from '../components/ui/Countdown.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import TripCard from '../components/TripCard.jsx';
import { EmptyState, PageLoader } from '../components/ui/Loading.jsx';
import { formatDateTime, isActiveStatus, relativeTime } from '../utils/format.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '' });
  const [activeTrip, setActiveTrip] = useState(null);
  const [trips, setTrips] = useState([]);
  const [guardians, setGuardians] = useState([]);
  const [notice, setNotice] = useState('');
  const [resending, setResending] = useState(false);

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });
    try {
      const [activeRes, tripsRes, guardiansRes] = await Promise.all([
        api.get('/trips/active'),
        api.get('/trips', { params: { limit: 6 } }),
        api.get('/guardians'),
      ]);
      setActiveTrip(activeRes.data.trip);
      setTrips(tripsRes.data.trips || []);
      setGuardians(guardiansRes.data.guardians || []);
      setState({ loading: false, error: '' });
    } catch (err) {
      setState({ loading: false, error: apiError(err, 'Could not load your dashboard.') });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  if (state.loading) return <PageLoader label="Loading your dashboard…" />;

  const activeGuardians = guardians.filter((g) => g.status === 'active');
  const recent = trips.filter((t) => !activeTrip || t._id !== activeTrip._id);

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Hi {user?.name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeTrip ? 'You have a trip in progress.' : 'Nothing in progress — plan your next trip when ready.'}
          </p>
        </div>
        <Link to="/trips/new" className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Plan a trip
        </Link>
      </div>

      {state.error && <Banner tone="error">{state.error}</Banner>}
      {notice && <Banner tone="success" onDismiss={() => setNotice('')}>{notice}</Banner>}

      {user && !user.isVerified && (
        <Banner tone="warning">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="flex items-center gap-1.5 font-medium">
              <MailWarning className="w-4 h-4" />
              Your email isn't verified yet.
            </span>
            <span>Some notifications may not reach you.</span>
            <button
              onClick={resendVerification}
              disabled={resending}
              className="font-semibold text-shield-700 underline disabled:opacity-50"
            >
              {resending ? 'Sending…' : 'Resend verification email'}
            </button>
          </div>
        </Banner>
      )}

      {activeTrip ? (
        <section className="card overflow-hidden">
          <div className="p-6 bg-gradient-to-br from-shield-50 to-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-shield-600 font-semibold">
                  {isActiveStatus(activeTrip.status) ? 'Trip in progress' : 'Scheduled'}
                </p>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-1 truncate">
                  {activeTrip.title || `Trip to ${activeTrip.destination?.label}`}
                </h2>
                <div className="flex items-center gap-2 text-sm text-slate-500 mt-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>{activeTrip.destination?.label}</span>
                </div>
              </div>
              <StatusBadge status={activeTrip.status} />
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mt-6">
              <div>
                <p className="text-xs text-slate-400">Next check-in</p>
                <p className="text-lg mt-0.5">
                  <Countdown to={activeTrip.nextCheckInDue} />
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Last check-in</p>
                <p className="text-sm font-medium text-slate-700 mt-1">
                  {activeTrip.lastCheckIn ? relativeTime(activeTrip.lastCheckIn) : 'Not yet'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Guardians watching</p>
                <p className="text-sm font-medium text-slate-700 mt-1">
                  {activeTrip.guardians?.length ?? 0}
                </p>
              </div>
            </div>

            <Link to={`/trips/${activeTrip._id}`} className="btn-primary inline-flex items-center gap-1.5 mt-6">
              Open live trip
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="No trip in progress"
          description="Create a trip, invite your guardians, and SafeTrail will keep an eye on your check-ins."
          action={
            <Link to="/trips/new" className="btn-primary flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Plan your first trip
            </Link>
          }
        />
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-slate-900">Recent trips</h2>
            {recent.length > 0 && (
              <Link to="/trips/new" className="text-xs font-medium text-shield-600 hover:underline">
                Plan another
              </Link>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="card p-6 text-sm text-slate-500">
              No other trips yet. Your past journeys will appear here.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {recent.map((trip) => (
                <TripCard key={trip._id} trip={trip} />
              ))}
            </div>
          )}

          {activeTrip?.status === 'scheduled' && (
            <div className="card p-4 flex items-center gap-3 text-sm text-slate-600">
              <CalendarClock className="w-4 h-4 text-shield-600" />
              <span>
                <strong>{activeTrip.destination?.label}</strong> starts {formatDateTime(activeTrip.startTime)}.
                Open the trip to start it.
              </span>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-slate-900">Your safety circle</h2>
            <Link to="/guardians" className="text-xs font-medium text-shield-600 hover:underline">
              Manage
            </Link>
          </div>

          <div className="card p-5 space-y-3">
            {activeGuardians.length === 0 ? (
              <>
                <span className="w-10 h-10 rounded-xl bg-shield-50 text-shield-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </span>
                <p className="text-sm text-slate-600">
                  You haven't added a guardian yet. They're the people who get alerted when you miss a check-in.
                </p>
                <Link to="/guardians" className="btn-primary inline-flex text-sm">
                  Add a guardian
                </Link>
              </>
            ) : (
              <>
                {activeGuardians.slice(0, 4).map((guardian) => (
                  <div key={guardian._id} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-safe-50 text-safe-600 text-xs font-bold flex items-center justify-center">
                      {(guardian.label || 'G').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{guardian.label || 'Guardian'}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {guardian.guardianUser?.name || guardian.guestName || guardian.guestEmail || '—'}
                      </p>
                    </div>
                  </div>
                ))}
                <Link to="/guardians" className="text-xs font-medium text-shield-600 hover:underline inline-flex items-center gap-1">
                  View all guardians <ArrowRight className="w-3 h-3" />
                </Link>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
