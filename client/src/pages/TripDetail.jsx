import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Users,
} from 'lucide-react';
import api, { apiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import useSocketEvent from '../hooks/useSocketEvent.js';
import useGeolocation from '../hooks/useGeolocation.js';
import LiveMap from '../components/LiveMap.jsx';
import Banner from '../components/ui/Banner.jsx';
import Countdown from '../components/ui/Countdown.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { PageLoader, Spinner } from '../components/ui/Loading.jsx';
import { formatDateTime, formatTime, isActiveStatus } from '../utils/format.js';

export default function TripDetail() {
  const { id } = useParams();
  const { socket } = useAuth();
  const geo = useGeolocation();

  const [trip, setTrip] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [sharing, setSharing] = useState(false);
  const [confirmSos, setConfirmSos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tripRes, locRes] = await Promise.all([
        api.get(`/trips/${id}`),
        api.get(`/trips/${id}/locations`).catch(() => ({ data: { locations: [] } })),
      ]);
      setTrip(tripRes.data.trip);
      setLocations(locRes.data.locations || []);
      setError('');
    } catch (err) {
      setError(apiError(err, 'Could not load this trip.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Join the realtime room for this trip.
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
        status: current.status === 'overdue' ? 'active' : current.status,
        lastCheckIn: confirmedAt,
        nextCheckInDue: new Date(new Date(confirmedAt).getTime() + interval * 60000).toISOString(),
        checkIns: [
          ...(current.checkIns || []),
          { confirmedAt, lat: payload.lat, lng: payload.lng, note: payload.note },
        ],
      };
    });
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
    setFeedback({ tone: 'error', text: 'SOS is active. Your guardians have been alerted.' });
  });

  useSocketEvent(socket, 'trip:completed', (payload) => {
    if (!payload || String(payload.tripId) !== String(id)) return;
    setTrip((current) => (current ? { ...current, status: 'completed', arrivedAt: payload.arrivedAt } : current));
    setFeedback({ tone: 'success', text: 'Trip completed. Welcome to your destination!' });
    setSharing(false);
  });

  useSocketEvent(socket, 'trip:overdue-warning', (payload) => {
    if (!payload || String(payload.tripId) !== String(id)) return;
    setTrip((current) => (current ? { ...current, status: 'overdue' } : current));
    setFeedback({ tone: 'warning', text: payload.message || 'Your check-in is overdue.' });
  });

  useSocketEvent(socket, 'trip:nudge', (payload) => {
    if (!payload) return;
    setFeedback({
      tone: 'info',
      text: payload.message || `${payload.guardianName || 'Your guardian'} is checking on you.`,
    });
  });

  // Broadcast live GPS while sharing is on.
  const positionRef = useRef(null);
  positionRef.current = geo.position;

  useEffect(() => {
    const canShare = sharing && trip && isActiveStatus(trip.status);
    if (!canShare) {
      if (!sharing) geo.stop();
      return undefined;
    }

    geo.start();
    const send = () => {
      const position = positionRef.current;
      if (!position) return;
      api.post(`/trips/${id}/location`, position).catch(() => {});
    };
    send();
    const timer = setInterval(send, 30000);

    return () => {
      clearInterval(timer);
      geo.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, id, trip?.status]);

  const points = useMemo(() => {
    const list = locations
      .map((entry) => entry.coordinates)
      .filter((coords) => coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng))
      .map((coords) => ({ lat: coords.lat, lng: coords.lng }));
    if (sharing && geo.position) list.push({ lat: geo.position.lat, lng: geo.position.lng });
    return list;
  }, [locations, sharing, geo.position]);

  const startTrip = async () => {
    setBusy('start');
    setFeedback(null);
    try {
      const { data } = await api.post(`/trips/${id}/start`);
      setTrip(data.trip);
      setFeedback({ tone: 'success', text: data.message });
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not start the trip.') });
    } finally {
      setBusy('');
    }
  };

  const checkIn = async () => {
    setBusy('checkin');
    setFeedback(null);

    let coords = {};
    try {
      const fix = await geo.getPosition();
      coords = { lat: fix.lat, lng: fix.lng };
    } catch {
      // Check in without coordinates if location is unavailable.
    }

    try {
      const { data } = await api.post(`/trips/${id}/checkin`, {
        ...coords,
        note: note.trim() || undefined,
      });
      setTrip(data.trip);
      setNote('');
      setFeedback({ tone: 'success', text: data.message });
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not check in.') });
    } finally {
      setBusy('');
    }
  };

  const sendSos = async () => {
    setBusy('sos');
    setFeedback(null);

    let coords = {};
    try {
      const fix = await geo.getPosition();
      coords = { lat: fix.lat, lng: fix.lng };
    } catch {
      // SOS still goes out without coordinates.
    }

    try {
      const { data } = await api.post(`/trips/${id}/sos`, coords);
      setTrip(data.trip);
      setConfirmSos(false);
      setFeedback({ tone: 'error', text: data.message });
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not send SOS.') });
    } finally {
      setBusy('');
    }
  };

  const completeTrip = async () => {
    if (!window.confirm('Mark this trip as completed?')) return;
    setBusy('complete');
    setFeedback(null);
    try {
      const { data } = await api.post(`/trips/${id}/complete`);
      setTrip(data.trip);
      setSharing(false);
      setFeedback({ tone: 'success', text: data.message });
    } catch (err) {
      setFeedback({ tone: 'error', text: apiError(err, 'Could not complete the trip.') });
    } finally {
      setBusy('');
    }
  };

  if (loading) return <PageLoader label="Loading trip…" />;

  if (error || !trip) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
        <Banner tone="error">{error || 'Trip not found.'}</Banner>
      </div>
    );
  }

  const active = isActiveStatus(trip.status);
  const checkIns = [...(trip.checkIns || [])].reverse();

  return (
    <div className="space-y-5 page-enter">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-bold text-slate-900 truncate">
              {trip.title || `Trip to ${trip.destination?.label}`}
            </h1>
            <StatusBadge status={trip.status} />
          </div>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-slate-400" />
            {trip.origin?.label ? `${trip.origin.label} → ` : ''}
            {trip.destination?.label}
          </p>
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
              Triggered {formatDateTime(trip.sos?.triggeredAt)}. Your guardians have been alerted with your
              last known location.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-slate-900">Live map</h2>
              {active && (
                <button
                  onClick={() => setSharing((value) => !value)}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    sharing ? 'bg-safe-50 text-safe-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Radio className={`w-3.5 h-3.5 ${sharing ? 'animate-pulse' : ''}`} />
                  {sharing ? 'Sharing location' : 'Share location'}
                </button>
              )}
            </div>
            <LiveMap points={points} status={trip.status} height={340} />
            {geo.error && sharing && <p className="text-xs text-danger-600 mt-2">{geo.error}</p>}
            <p className="text-xs text-slate-400 mt-2">
              {sharing
                ? 'Location updates are sent every 30 seconds while this page is open.'
                : 'Location sharing is off. Turn it on so guardians can follow your live position.'}
            </p>
          </div>

          <div className="card p-5">
            <h2 className="font-display font-semibold text-slate-900">
              {active ? 'Actions' : 'Trip actions'}
            </h2>

            {trip.status === 'scheduled' && (
              <div className="mt-3">
                <p className="text-sm text-slate-500">
                  Starts {formatDateTime(trip.startTime)}. Starting now begins your check-in timer
                  ({trip.checkInInterval} min).
                </p>
                <button
                  onClick={startTrip}
                  disabled={busy === 'start'}
                  className="btn-primary flex items-center gap-1.5 mt-4"
                >
                  {busy === 'start' ? <Spinner className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  Start trip
                </button>
              </div>
            )}

            {active && trip.status !== 'sos' && (
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="note" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Check-in note <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    id="note"
                    rows={2}
                    maxLength={200}
                    className="input resize-none"
                    placeholder="All good, just left the station."
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={checkIn}
                    disabled={busy === 'checkin'}
                    className="btn-primary flex items-center gap-1.5"
                  >
                    {busy === 'checkin' ? <Spinner className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    I'm safe — check in
                  </button>
                  <button onClick={() => setConfirmSos(true)} className="btn-sos px-5 py-2.5 text-base flex items-center gap-1.5">
                    <Siren className="w-4 h-4" />
                    SOS
                  </button>
                </div>
              </div>
            )}

            {trip.status === 'sos' && (
              <button
                onClick={completeTrip}
                disabled={busy === 'complete'}
                className="btn-primary flex items-center gap-1.5 mt-3"
              >
                {busy === 'complete' ? <Spinner className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                I'm safe — end trip
              </button>
            )}

            {active && trip.status !== 'sos' && (
              <button onClick={completeTrip} disabled={busy === 'complete'} className="btn-ghost mt-4 !px-0 text-sm">
                Arrived? Complete the trip
              </button>
            )}

            {trip.status === 'completed' && (
              <p className="text-sm text-slate-500 mt-3">
                Arrived {formatDateTime(trip.arrivedAt)}. Your guardians have been notified.
              </p>
            )}

            {trip.status === 'cancelled' && (
              <p className="text-sm text-slate-500 mt-3">This trip was cancelled before it started.</p>
            )}

            {confirmSos && (
              <div className="mt-4 rounded-xl border-2 border-danger-400 bg-red-50 p-4">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-5 h-5 text-danger-500 mt-0.5" />
                  <div>
                    <p className="font-semibold text-danger-600">Send an SOS to your guardians?</p>
                    <p className="text-sm text-red-700 mt-0.5">
                      This shares your current location and marks the trip as an emergency.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={sendSos}
                    disabled={busy === 'sos'}
                    className="btn-danger flex items-center gap-1.5"
                  >
                    {busy === 'sos' ? <Spinner className="w-4 h-4" /> : <Siren className="w-4 h-4" />}
                    Send SOS now
                  </button>
                  <button onClick={() => setConfirmSos(false)} className="btn-ghost bg-white">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-display font-semibold text-slate-900">Check-in history</h2>
            {checkIns.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">No check-ins yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-50">
                {checkIns.map((checkIn, index) => (
                  <li key={`${checkIn.confirmedAt}-${index}`} className="py-3 flex items-start gap-3">
                    <span className="w-8 h-8 rounded-full bg-safe-50 text-safe-600 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        Checked in at {formatTime(checkIn.confirmedAt)}
                      </p>
                      {checkIn.note && <p className="text-sm text-slate-500 mt-0.5">{checkIn.note}</p>}
                      {Number.isFinite(checkIn.lat) && Number.isFinite(checkIn.lng) && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {checkIn.lat.toFixed(4)}, {checkIn.lng.toFixed(4)}
                        </p>
                      )}
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
                <dt className="text-slate-400">Transport</dt>
                <dd className="text-slate-700 capitalize text-right">
                  {trip.transport}
                  {trip.transportRef ? ` · ${trip.transportRef}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Start</dt>
                <dd className="text-slate-700 text-right">{formatDateTime(trip.startTime)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Est. arrival</dt>
                <dd className="text-slate-700 text-right">{formatDateTime(trip.estimatedArrival)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Check-in interval</dt>
                <dd className="text-slate-700 text-right">{trip.checkInInterval} min</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Last check-in</dt>
                <dd className="text-slate-700 text-right">{formatDateTime(trip.lastCheckIn)}</dd>
              </div>
            </dl>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-slate-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                Guardians
              </h2>
              <Link to="/guardians" className="text-xs font-medium text-shield-600 hover:underline">
                Manage
              </Link>
            </div>
            {!trip.guardians?.length ? (
              <p className="text-sm text-slate-500 mt-2">
                No guardians attached. Add one so someone is alerted if you miss a check-in.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {trip.guardians.map((guardian) => (
                  <li key={guardian._id} className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-shield-50 text-shield-700 text-xs font-bold flex items-center justify-center">
                      {(guardian.label || 'G').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{guardian.label || 'Guardian'}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {guardian.guestName || guardian.guestEmail || guardian.status}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
