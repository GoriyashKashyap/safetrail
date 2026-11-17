import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { relativeTime, statusMeta } from '../utils/format.js';

const PIN_TONE = { active: 'active', overdue: 'overdue', sos: 'sos' };

const makeIcon = (person) =>
  L.divIcon({
    className: '',
    html: `<div class="safetrail-pin ${PIN_TONE[person.status] || 'active'}">${person.initials || '?'}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });

const hasCoords = (point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng);

/**
 * Fits the view once per set of people instead of on every position update —
 * a guardian should not lose their zoom every 30 seconds because a pin moved.
 * `fitSignal` lets the caller ask for a refit (the "Fit all" button).
 */
function FitToPeople({ people, focusId, fitSignal }) {
  const map = useMap();
  const signature = `${fitSignal}:${people.map((person) => person.id).sort().join('|')}`;

  useEffect(() => {
    if (!people.length) return;
    if (people.length === 1) {
      map.setView([people[0].lat, people[0].lng], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(people.map((person) => [person.lat, person.lng])), {
      padding: [50, 50],
      maxZoom: 14,
    });
    // Only when the set of people (or an explicit fit request) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  useEffect(() => {
    const focus = people.find((person) => person.id === focusId);
    if (focus) map.setView([focus.lat, focus.lng], 14, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focusId]);

  return null;
}

/**
 * Overview map for a guardian: one pin per person currently travelling, plus a
 * marker for each destination. Positions come from the traveller's GPS pings,
 * so pins move as `location:update` events arrive.
 */
export default function GuardianMap({ people = [], focusId = null, fitSignal = 0, height = 340, className = '' }) {
  const located = useMemo(() => people.filter(hasCoords), [people]);
  const first = located[0];

  if (!located.length) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1.5 text-slate-400 ${className}`}
        style={{ height }}
      >
        <MapPin className="w-6 h-6" />
        <p className="text-sm">No live position yet</p>
        <p className="text-xs px-6 text-center">
          Pins appear as soon as someone you guard shares their location.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl overflow-hidden border border-slate-100 ${className}`} style={{ height }}>
      <MapContainer
        center={[first.lat, first.lng]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {located.map((person) =>
          hasCoords(person.destination) ? (
            <CircleMarker
              key={`destination-${person.id}`}
              center={[person.destination.lat, person.destination.lng]}
              radius={6}
              pathOptions={{ color: '#0d72c9', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {person.destination.label} — {person.name}'s destination
              </Tooltip>
            </CircleMarker>
          ) : null
        )}

        {located.map((person) => (
          <Marker
            key={person.id}
            position={[person.lat, person.lng]}
            icon={makeIcon(person)}
            zIndexOffset={person.status === 'sos' ? 1000 : 0}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              <span className="font-semibold">{person.name}</span>
              {person.updatedAt ? <span className="text-slate-500"> · {relativeTime(person.updatedAt)}</span> : null}
            </Tooltip>
            <Popup>
              <div className="space-y-1.5">
                <p className="font-semibold text-slate-900">{person.name}</p>
                <p className="text-xs text-slate-500">
                  {[person.role, person.tripLabel].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-slate-600">
                  {statusMeta(person.status).label}
                  {person.updatedAt ? ` · updated ${relativeTime(person.updatedAt)}` : ' · no position yet'}
                </p>
                {Number.isFinite(person.battery) && (
                  <p className="text-xs text-slate-500">Battery {person.battery}%</p>
                )}
                {person.href && (
                  <Link to={person.href} className="text-xs font-medium text-shield-600 hover:underline block">
                    Open their live trip
                  </Link>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        <FitToPeople people={located} focusId={focusId} fitSignal={fitSignal} />
      </MapContainer>
    </div>
  );
}
