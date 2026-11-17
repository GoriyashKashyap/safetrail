import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import StatusBadge from './ui/StatusBadge.jsx';
import Countdown from './ui/Countdown.jsx';
import { formatDateTime, isActiveStatus } from '../utils/format.js';

export default function TripCard({ trip, to }) {
  const href = to || `/trips/${trip._id}`;

  return (
    <Link
      to={href}
      className="card p-5 flex flex-col gap-3 hover:border-shield-400/50 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 truncate">
            {trip.title || `Trip to ${trip.destination?.label}`}
          </p>
          <h3 className="font-display font-semibold text-slate-900 truncate mt-0.5">
            {trip.destination?.label || 'Destination'}
          </h3>
        </div>
        <StatusBadge status={trip.status} />
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-500">
        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="truncate">{trip.origin?.label || 'Current location'}</span>
        <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
        <span className="truncate">{trip.destination?.label}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-50">
        <span>{formatDateTime(trip.startTime)}</span>
        {isActiveStatus(trip.status) && trip.nextCheckInDue ? (
          <span>
            Check-in <Countdown to={trip.nextCheckInDue} />
          </span>
        ) : (
          <span className="group-hover:text-shield-600 flex items-center gap-1 font-medium">
            Open <ArrowRight className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </Link>
  );
}
