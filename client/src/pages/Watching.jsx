import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, MapPin, ShieldCheck } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import useSocketEvent from '../hooks/useSocketEvent.js';
import Banner from '../components/ui/Banner.jsx';
import Countdown from '../components/ui/Countdown.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { EmptyState, PageLoader } from '../components/ui/Loading.jsx';
import { formatDateTime, initials, isActiveStatus, relativeTime } from '../utils/format.js';

export default function Watching() {
  const { socket } = useAuth();
  const [trips, setTrips] = useState([]);
  const [guardianships, setGuardianships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alert, setAlert] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    // Loaded independently: a temporary failure on one endpoint must not hide
    // the trips that did load (that used to blank the whole page).
    const [watchRes, guardianRes] = await Promise.allSettled([
      api.get('/trips/watching'),
      api.get('/guardians/watching'),
    ]);

    if (watchRes.status === 'fulfilled') setTrips(watchRes.value.data.trips || []);
    if (guardianRes.status === 'fulfilled') {
      setGuardianships(guardianRes.value.data.guardianships || []);
    }

    const failure = watchRes.status === 'rejected' ? watchRes : guardianRes;
    setError(
      failure.status === 'rejected'
        ? apiError(failure.reason, 'Could not load everything you watch.')
        : ''
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Subscribe to every watched traveller's active trip room.
  useEffect(() => {
    if (!socket) return undefined;
    socket.emit('guardian:join-all');
    return undefined;
  }, [socket]);

  const rejoinRooms = useCallback(() => socket?.emit('guardian:join-all'), [socket]);

  // Sockets can be missed (backgrounded tab, flaky mobile network, a trip that
  // started before this page was opened), so also poll while visible and
  // refresh whenever the page regains focus.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };
    const interval = setInterval(tick, 30000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  useSocketEvent(socket, 'alert:overdue', (payload) => {
    if (!payload) return;
    setAlert({
      tone: 'warning',
      text: `${payload.travellerName || 'A traveller'} is overdue: ${payload.message || 'missed a check-in.'}`,
    });
    load();
  });

  useSocketEvent(socket, 'trip:sos', (payload) => {
    if (!payload) return;
    setAlert({
      tone: 'error',
      text: `SOS from ${payload.travellerName || 'a traveller'} — ${payload.message || 'they need help.'}`,
    });
    load();
  });

  useSocketEvent(socket, 'trip:checkin', () => load());
  useSocketEvent(socket, 'trip:completed', () => load());

  // A trip can start while this page is already open: the guardian is not yet
  // in that trip's room, so refresh both the room list and the data.
  useSocketEvent(socket, 'trip:started', (payload) => {
    setNotice({
      tone: 'info',
      text: `${payload?.travellerName || 'Someone you guard'} started a trip${
        payload?.destination ? ` to ${payload.destination}` : ''
      }.`,
    });
    rejoinRooms();
    load();
  });

  useSocketEvent(socket, 'guardian:added', (payload) => {
    setNotice({
      tone: 'success',
      text: `${payload?.travellerName || 'A traveller'} added you as a guardian. Their live trips are below.`,
    });
    rejoinRooms();
    load();
  });

  const respond = async (id, action) => {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/guardians/${id}/${action}`);
      setNotice({
        tone: 'success',
        text: action === 'accept' ? 'Invitation accepted — you are now their guardian.' : 'Invitation declined.',
      });
      await load();
      rejoinRooms();
    } catch (err) {
      setError(apiError(err, 'Could not update the invitation.'));
    } finally {
      setBusyId('');
    }
  };

  if (loading) return <PageLoader label="Loading trips you watch…" />;

  const activeGuardianships = guardianships.filter((guardian) => guardian.status === 'active');
  const pendingGuardianships = guardianships.filter((guardian) => guardian.status === 'pending');
  const live = trips.filter((trip) => isActiveStatus(trip.status));
  const past = trips.filter((trip) => !isActiveStatus(trip.status));

  return (
    <div className="space-y-5 page-enter">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Watching</h1>
        <p className="text-sm text-slate-500 mt-1">
          The people you guard and their live trips. You'll be alerted here if someone misses a check-in or
          triggers an SOS.
        </p>
        <p className="text-xs text-slate-400 mt-1.5">
          Want these alerts on your phone? Connect Telegram in{' '}
          <Link to="/settings" className="text-shield-600 hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>

      {error && <Banner tone="error">{error}</Banner>}
      {alert && (
        <Banner tone={alert.tone} onDismiss={() => setAlert(null)}>
          {alert.text}
        </Banner>
      )}
      {notice && (
        <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      )}

      {activeGuardianships.length === 0 && pendingGuardianships.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="You're not watching anyone yet"
          description="When someone adds you as their guardian, their live trips show up here — even if the trip is already running."
        />
      ) : (
        <>
          {pendingGuardianships.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display font-semibold text-slate-900">Invitations</h2>
              <div className="card divide-y divide-slate-50">
                {pendingGuardianships.map((guardianship) => (
                  <div key={guardianship._id} className="p-4 flex flex-wrap items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 text-xs font-bold flex items-center justify-center">
                      {initials(guardianship.traveller?.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {guardianship.traveller?.name || 'A traveller'}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        Wants you as their {String(guardianship.label || 'guardian').toLowerCase()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => respond(guardianship._id, 'accept')}
                        disabled={busyId === guardianship._id}
                        className="btn-primary text-sm disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respond(guardianship._id, 'decline')}
                        disabled={busyId === guardianship._id}
                        className="btn-ghost border border-slate-200 text-sm disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeGuardianships.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display font-semibold text-slate-900">People you guard</h2>
              <div className="card divide-y divide-slate-50">
                {/* Every monitored person is listed even when they are not
                    travelling, so the guardian always knows who they watch. */}
                {activeGuardianships.map((guardianship) => {
                  const trip = guardianship.activeTrip;
                  return (
                    <div key={guardianship._id} className="p-4 flex flex-wrap items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-shield-50 text-shield-700 text-xs font-bold flex items-center justify-center">
                        {initials(guardianship.traveller?.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {guardianship.traveller?.name || 'Traveller'}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {guardianship.label}
                          {guardianship.traveller?.email ? ` · ${guardianship.traveller.email}` : ''}
                        </p>
                      </div>

                      {trip ? (
                        <Link
                          to={`/guardian/trip/${trip._id}`}
                          className="flex items-center gap-2 text-sm font-medium text-shield-600 hover:text-shield-700"
                        >
                          <StatusBadge status={trip.status} />
                          Live map
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-slate-400">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          No trip in progress
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="font-display font-semibold text-slate-900">In progress</h2>
            {live.length === 0 ? (
              <div className="card p-6 text-sm text-slate-500">
                No active trips right now. You'll see them here as soon as a trip starts.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {live.map((trip) => (
                  <Link
                    key={trip._id}
                    to={`/guardian/trip/${trip._id}`}
                    className="card p-5 space-y-3 hover:border-shield-400/50 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-shield-50 text-shield-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {initials(trip.traveller?.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{trip.traveller?.name}</p>
                          <p className="text-xs text-slate-400 truncate">
                            {trip.guardianLabel ? `${trip.guardianLabel} · ` : ''}
                            {trip.title || `Trip to ${trip.destination?.label}`}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={trip.status} />
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate">{trip.destination?.label}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-50">
                      <span>
                        Last check-in {trip.lastCheckIn ? relativeTime(trip.lastCheckIn) : 'never'}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-shield-600">
                        {trip.nextCheckInDue ? <Countdown to={trip.nextCheckInDue} /> : 'Open'}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display font-semibold text-slate-900">Recent history</h2>
              <div className="card divide-y divide-slate-50">
                {past.slice(0, 10).map((trip) => (
                  <Link
                    key={trip._id}
                    to={`/guardian/trip/${trip._id}`}
                    className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {trip.traveller?.name} → {trip.destination?.label}
                      </p>
                      <p className="text-xs text-slate-400">{formatDateTime(trip.startTime)}</p>
                    </div>
                    <StatusBadge status={trip.status} />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
