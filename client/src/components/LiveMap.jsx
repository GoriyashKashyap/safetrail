import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin } from 'lucide-react';

const MARKER_CLASS = {
  active: 'active',
  overdue: 'overdue',
  sos: 'sos',
};

const makeIcon = (status) =>
  L.divIcon({
    className: '',
    html: `<div class="safetrail-marker ${MARKER_CLASS[status] || 'active'}"></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });

function FitToPoints({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40] });
  }, [map, points]);

  return null;
}

/**
 * Live trip map. `points` is an ordered list of { lat, lng }; the last point is
 * marked and the whole trail is drawn as a polyline.
 */
export default function LiveMap({ points = [], status = 'active', height = 320, className = '' }) {
  const clean = useMemo(
    () => points.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)),
    [points]
  );
  const icon = useMemo(() => makeIcon(status), [status]);
  const last = clean[clean.length - 1];

  if (!clean.length) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-400 ${className}`}
        style={{ height }}
      >
        <MapPin className="w-6 h-6" />
        <p className="text-sm">No location yet</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl overflow-hidden border border-slate-100 ${className}`} style={{ height }}>
      <MapContainer
        center={[last.lat, last.lng]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {clean.length > 1 && (
          <Polyline
            positions={clean.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: '#0d72c9', weight: 3, opacity: 0.75 }}
          />
        )}
        <Marker position={[last.lat, last.lng]} icon={icon} />
        <FitToPoints points={clean} />
      </MapContainer>
    </div>
  );
}
