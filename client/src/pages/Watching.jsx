import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, MapPin, Users } from 'lucide-react';
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

  const load = useCallback(async () => {
    try {
      const [watchRes, guardianRes] = await Promise.all([
        api.get('/trips/watching'),
        api.get('/guardians/watching'),
      ]);
      setTrips(watchRes.data.trips || []);
      setGuardianships(guardianRes.data.guardianships || []);
      setError('');
    } catch (err) {
      setError(apiError(err, 'Could not load the trips you watch.'));
    } finally {
      setLoading(false);
    }
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

  if (loading) return <PageLoader label="Loading trips you watch…" />;

  const live = trips.filter((trip) => isActiveStatus(trip.status));
  const past = trips.filter((trip) => !isActiveStatus(trip.status));

  return (
    <div className="space-y-5 page-enter">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Watching</h1>
        <p className="text-sm text-slate-500 mt-1">
          Live trips you're a guardian for. You'll be alerted here if someone misses a check-in.
        </p>
      </div>

      {error && <Banner tone="error">{error}</Banner>}
      {alert && (
        <Banner tone={alert.tone} onDismiss={() => setAlert(null)}>
          {alert.text}
        </Banner>
      )}

      {guardianships.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="You're not watching anyone yet"
          description="When someone adds you as their guardian, accept the invite and their live trips will show up here."
        />
      ) : (
        <>
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

          <section className="space-y-3">
            <h2 className="font-display font-semibold text-slate-900">People you guard</h2>
            <div className="card divide-y divide-slate-50">
              {guardianships.map((guardianship) => (
                <div key={guardianship._id} className="p-4 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center">
                    {initials(guardianship.traveller?.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {guardianship.traveller?.name || 'Traveller'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {guardianship.label} · {guardianship.traveller?.email}
                    </p>
                  </div>
                  <Users className="w-4 h-4 text-slate-300" />
                </div>
              ))}
            </div>
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
