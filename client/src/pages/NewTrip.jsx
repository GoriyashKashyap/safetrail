import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Plus } from 'lucide-react';
import api, { apiError } from '../services/api.js';
import Banner from '../components/ui/Banner.jsx';
import { Spinner } from '../components/ui/Loading.jsx';
import { toDateTimeLocal } from '../utils/format.js';

const TRANSPORTS = [
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'car', label: 'Car' },
  { value: 'flight', label: 'Flight' },
  { value: 'other', label: 'Other' },
];

export default function NewTrip() {
  const navigate = useNavigate();
  const [guardians, setGuardians] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState(() => ({
    title: '',
    origin: '',
    destination: '',
    transport: 'train',
    transportRef: '',
    startTime: toDateTimeLocal(Date.now() + 15 * 60 * 1000),
    estimatedArrival: toDateTimeLocal(Date.now() + 2 * 60 * 60 * 1000),
    checkInInterval: '30',
  }));

  useEffect(() => {
    api
      .get('/guardians')
      .then(({ data }) => {
        const active = (data.guardians || []).filter((g) => g.status === 'active');
        setGuardians(active);
        setSelected(active.map((g) => g._id));
      })
      .catch(() => setGuardians([]));
  }, []);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const toggleGuardian = (id) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    const start = new Date(form.startTime);
    const arrival = new Date(form.estimatedArrival);
    if (Number.isNaN(start.getTime()) || Number.isNaN(arrival.getTime())) {
      setError('Enter a valid start and arrival time.');
      return;
    }
    if (arrival <= start) {
      setError('Estimated arrival must be after the start time.');
      return;
    }
    if (guardians.length > 0 && selected.length === 0) {
      setError('Keep at least one guardian selected, or add guardians first.');
      return;
    }

    const payload = {
      title: form.title.trim() || undefined,
      origin: form.origin.trim() ? { label: form.origin.trim() } : undefined,
      destination: { label: form.destination.trim() },
      transport: form.transport,
      transportRef: form.transportRef.trim() || undefined,
      startTime: start.toISOString(),
      estimatedArrival: arrival.toISOString(),
      checkInInterval: Number(form.checkInInterval),
      guardianIds: selected,
    };

    setBusy(true);
    try {
      const { data } = await api.post('/trips', payload);
      navigate(`/trips/${data.trip._id}`, { replace: true });
    } catch (err) {
      setError(apiError(err, 'Could not create the trip.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto page-enter">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </Link>

      <h1 className="font-display text-2xl font-bold text-slate-900">Plan a trip</h1>
      <p className="text-sm text-slate-500 mt-1">
        Your guardians will follow along and be alerted if you miss a check-in.
      </p>

      <form onSubmit={submit} className="card p-6 mt-5 space-y-5">
        {error && <Banner tone="error">{error}</Banner>}

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1.5">
            Trip name <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            id="title"
            className="input"
            placeholder="Weekend trip to Rishikesh"
            value={form.title}
            onChange={set('title')}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="origin" className="block text-sm font-medium text-slate-700 mb-1.5">
              From <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="origin"
              className="input"
              placeholder="Delhi"
              value={form.origin}
              onChange={set('origin')}
            />
          </div>
          <div>
            <label htmlFor="destination" className="block text-sm font-medium text-slate-700 mb-1.5">
              To
            </label>
            <input
              id="destination"
              required
              className="input"
              placeholder="Rishikesh"
              value={form.destination}
              onChange={set('destination')}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="transport" className="block text-sm font-medium text-slate-700 mb-1.5">
              Transport
            </label>
            <select id="transport" className="input" value={form.transport} onChange={set('transport')}>
              {TRANSPORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="transportRef" className="block text-sm font-medium text-slate-700 mb-1.5">
              Flight / train / plate <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="transportRef"
              className="input"
              maxLength={40}
              placeholder="AI 402"
              value={form.transportRef}
              onChange={set('transportRef')}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-slate-700 mb-1.5">
              Start
            </label>
            <input
              id="startTime"
              type="datetime-local"
              required
              className="input"
              value={form.startTime}
              onChange={set('startTime')}
            />
          </div>
          <div>
            <label htmlFor="estimatedArrival" className="block text-sm font-medium text-slate-700 mb-1.5">
              Estimated arrival
            </label>
            <input
              id="estimatedArrival"
              type="datetime-local"
              required
              className="input"
              value={form.estimatedArrival}
              onChange={set('estimatedArrival')}
            />
          </div>
        </div>

        <div>
          <label htmlFor="interval" className="block text-sm font-medium text-slate-700 mb-1.5">
            Check in every
          </label>
          <select id="interval" className="input" value={form.checkInInterval} onChange={set('checkInInterval')}>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
          <p className="text-xs text-slate-400 mt-1">
            If you don't check in within this window, guardians get an overdue alert.
          </p>
        </div>

        <div>
          <p className="block text-sm font-medium text-slate-700 mb-2">Guardians watching</p>
          {guardians.length === 0 ? (
            <div className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
              You have no active guardians yet.{' '}
              <Link to="/guardians" className="text-shield-600 font-medium hover:underline">
                Add one
              </Link>{' '}
              so someone is alerted if you can't check in.
            </div>
          ) : (
            <div className="space-y-2">
              {guardians.map((guardian) => (
                <label
                  key={guardian._id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-2.5 text-sm cursor-pointer hover:border-shield-400/50"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-shield-600"
                    checked={selected.includes(guardian._id)}
                    onChange={() => toggleGuardian(guardian._id)}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-slate-800">{guardian.label || 'Guardian'}</span>
                    <span className="text-slate-400 ml-2 truncate">
                      {guardian.guardianUser?.name || guardian.guestName || guardian.guestEmail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link to="/" className="btn-ghost">
            Cancel
          </Link>
          <button type="submit" disabled={busy} className="btn-primary flex items-center gap-1.5">
            {busy ? <Spinner className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {busy ? 'Creating…' : 'Create trip'}
          </button>
        </div>
      </form>

      <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-3 px-1">
        <MapPin className="w-3.5 h-3.5" />
        Location is only shared once you start the trip and turn on live sharing.
      </p>
    </div>
  );
}
