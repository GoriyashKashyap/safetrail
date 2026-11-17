import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BellRing, CheckCircle2, MapPin, Phone, Siren } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import useSocketEvent from '../hooks/useSocketEvent.js';
import LiveMap from '../components/LiveMap.jsx';
import Banner from '../components/ui/Banner.jsx';
import Countdown from '../components/ui/Countdown.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { PageLoader } from '../components/ui/Loading.jsx';
import { formatDateTime, formatTime, isActiveStatus, relativeTime } from '../utils/format.js';

export default function GuardianTrip() {
  const { id } = useParams();
  const { socket } = useAuth();

  const [trip, setTrip] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [nudging, setNudging] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await api.get('/trips/watching');
        const found = (data.trips || []).find((item) => String(item._id) === String(id));
        if (cancelled) return;
        if (!found) {
          setError('You are not guarding this trip, or it no longer exists.');
          setLoading(false);
          return;
        }
        setTrip(found);

        const locRes = await api
          .get(`/trips/${id}/locations`)
          .catch(() => ({ data: { locations: [] } }));
        if (cancelled) return;
        setLocations(locRes.data.locations || []);
      } catch (err) {
        if (!cancelled) setError(apiError(err, 'Could not load this trip.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!socket || !id) return undefined;
    socket.emit('trip:join', { tripId: id });
    return () => socket.emit('trip:leave', { tripId: id });
  }, [socket, id]);

  useSocketEvent(socket, 'location:update', (payload) => {
    if (!payload || String(payload.tripId) !== String(id)) return;
    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) return;
    setLocations((current) => [
      ...current,
      {
        _id: `live-${payload.timestamp || Date.now()}-${payload.lat}`,
        coordinates: { lat: payload.lat, lng: payload.lng },
        timestamp: payload.timestamp || new Date().toISOString(),
      },
    ]);
  });

  useSocketEvent(socket, 'trip:checkin', (payload) => {
    if (!payload || String(payload.tripId) !== String(id)) return;
    setTrip((current) => {
      if (!current) return current;
      const interval = current.checkInInterval || 30;
      const confirmedAt = payload.confirmedAt || new Date().toISOString();
      return {
        ...current,
        status: 'active',
        lastCheckIn: confirmedAt,
        nextCheckInDue: new Date(new Date(confirmedAt).getTime() + interval * 60000).toISOString(),
        checkIns: [
          ...(current.checkIns || []),
          { confirmedAt, lat: payload.lat, lng: payload.lng, note: payload.note },
        ],
      };
    });
    setFeedback({ tone: 'success', text: `${payload.travellerName || 'They'} checked in just now.` });
    if (Number.isFinite(payload.lat) && Number.isFinite(payload.lng)) {
      setLocations((current) => [
        ...current,
        {
          _id: `checkin-${payload.confirmedAt || Date.now()}`,
          coordinates: { lat: payload.lat, lng: payload.lng },
          timestamp: payload.confirmedAt || new Date().toISOString(),
        },
      ]);
    }
  });

  useSocketEvent(socket, 'trip:sos', (payload) => {
    if (!payload || String(payload.tripId) !== String(id)) return;
    setTrip((current) => (current ? { ...current, status: 'sos' } : current));
    setFeedback({ tone: 'error', text: payload.message || 'They triggered an SOS.' });
  });

  useSocketEvent(socket, 'alert:overdue', (payload) => {
    if (!payload || String(payload.tripId) !== String(id)) return;
    setTrip((current) => (current ? { ...current, status: 'overdue' } : current));
    setFeedback({ tone: 'warning', text: payload.message || 'Their check-in is overdue.' });
  });

  useSocketEvent(socket, 'trip:completed', (payload) => {
    if (!payload || String(payload.tripId) !== String(id)) return;
    setTrip((current) => (current ? { ...current, status: 'completed', arrivedAt: payload.arrivedAt } : current));
    setFeedback({ tone: 'success', text: 'They arrived safely. Trip completed.' });
  });

  useSocketEvent(socket, 'error', (payload) => {
    if (payload?.message) setFeedback({ tone: 'error', text: payload.message });
  });

  const nudge = () => {
    if (!socket) return;
    setNudging(true);
    socket.emit('guardian:nudge', { tripId: id });
    setFeedback({ tone: 'info', text: 'Nudge sent — they will see your check-in request.' });
    setTimeout(() => setNudging(false), 2000);
  };

  if (loading) return <PageLoader label="Loading trip…" />;

  if (error || !trip) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Link to="/watching" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" />
          Back to watching
        </Link>
        <Banner tone="error">{error || 'Trip not found.'}</Banner>
      </div>
    );
  }

  const active = isActiveStatus(trip.status);
  const points = locations
    .map((entry) => entry.coordinates)
    .filter((coords) => coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng));
  const checkIns = [...(trip.checkIns || [])].reverse();

  return (
    <div className="space-y-5 page-enter">
      <Link to="/watching" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" />
        Back to watching
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-bold text-slate-900">
              {trip.traveller?.name || 'Traveller'}
            </h1>
            <StatusBadge status={trip.status} />
          </div>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-slate-400" />
            {trip.destination?.label} · {trip.title || `Trip to ${trip.destination?.label}`}
          </p>
          {trip.traveller?.phone && (
            <a
              href={`tel:${trip.traveller.phone}`}
              className="text-sm text-shield-600 hover:underline inline-flex items-center gap-1 mt-1"
            >
              <Phone className="w-3.5 h-3.5" />
              {trip.traveller.phone}
            </a>
          )}
        </div>

        {active && (
          <div className="bg-white border border-slate-100 rounded-2xl px-5 py-3 text-right">
            <p className="text-xs text-slate-400">Next check-in</p>
            <p className="text-lg">
              <Countdown to={trip.nextCheckInDue} />
            </p>
          </div>
        )}
      </div>

      {feedback && (
        <Banner tone={feedback.tone} onDismiss={() => setFeedback(null)}>
          {feedback.text}
        </Banner>
      )}

      {trip.status === 'sos' && (
        <div className="rounded-2xl border-2 border-danger-400 bg-red-50 px-5 py-4 flex items-start gap-3">
          <Siren className="w-5 h-5 text-danger-500 mt-0.5" />
          <div>
            <p className="font-semibold text-danger-600">SOS active</p>
            <p className="text-sm text-red-700 mt-0.5">
              {trip.traveller?.name} triggered an SOS {formatDateTime(trip.sos?.triggeredAt)}.
              {trip.sos?.message ? ` Message: "${trip.sos.message}"` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-slate-900">Live map</h2>
              <span className="text-xs text-slate-400">
                Last update {trip.lastCheckIn ? relativeTime(trip.lastCheckIn) : '—'}
              </span>
            </div>
            <LiveMap points={points} status={trip.status} height={360} />
            {trip.status === 'sos' && points.length > 0 && (
              <a
                href={`https://www.google.com/maps?q=${points[points.length - 1].lat},${points[points.length - 1].lng}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-shield-600 hover:underline mt-2 inline-block"
              >
                Open last known location in Google Maps
              </a>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-display font-semibold text-slate-900">Recent check-ins</h2>
            {checkIns.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">No check-ins yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-50">
                {checkIns.slice(0, 8).map((checkIn, index) => (
                  <li key={`${checkIn.confirmedAt}-${index}`} className="py-3 flex items-start gap-3">
                    <span className="w-8 h-8 rounded-full bg-safe-50 text-safe-600 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        Checked in at {formatTime(checkIn.confirmedAt)}
                      </p>
                      {checkIn.note && <p className="text-sm text-slate-500 mt-0.5">{checkIn.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="card p-5">
            <h2 className="font-display font-semibold text-slate-900">Trip details</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Started</dt>
                <dd className="text-slate-700 text-right">{formatDateTime(trip.startTime)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Est. arrival</dt>
                <dd className="text-slate-700 text-right">{formatDateTime(trip.estimatedArrival)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Transport</dt>
                <dd className="text-slate-700 capitalize text-right">
                  {trip.transport}
                  {trip.transportRef ? ` · ${trip.transportRef}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Check-in every</dt>
                <dd className="text-slate-700 text-right">{trip.checkInInterval} min</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Last check-in</dt>
                <dd className="text-slate-700 text-right">{formatDateTime(trip.lastCheckIn)}</dd>
              </div>
            </dl>
          </div>

          {active && (
            <div className="card p-5">
              <h2 className="font-display font-semibold text-slate-900">Check on them</h2>
              <p className="text-sm text-slate-500 mt-1">
                Send a nudge — they'll get a notification asking to confirm they're safe.
              </p>
              <button
                onClick={nudge}
                disabled={nudging || !socket}
                className="btn-primary w-full flex items-center justify-center gap-1.5 mt-3"
              >
                <BellRing className="w-4 h-4" />
                {nudging ? 'Nudge sent' : 'Send a nudge'}
              </button>
            </div>
          )}

          <div className="card p-5">
            <h2 className="font-display font-semibold text-slate-900">Your role</h2>
            <p className="text-sm text-slate-500 mt-1">
              You're watching as <strong className="text-slate-700">{trip.guardianLabel || 'Guardian'}</strong>.
              Only active guardians can see live location and receive alerts.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
