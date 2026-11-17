export const STATUS_META = {
  scheduled: { label: 'Scheduled', badge: 'bg-shield-50 text-shield-700', dot: 'bg-shield-400' },
  active: { label: 'Active', badge: 'badge-safe', dot: 'dot-active' },
  overdue: { label: 'Overdue', badge: 'badge-warn', dot: 'dot-overdue' },
  sos: { label: 'SOS', badge: 'badge-danger', dot: 'dot-sos' },
  completed: { label: 'Completed', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  cancelled: { label: 'Cancelled', badge: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' },
};

export const statusMeta = (status) => STATUS_META[status] || STATUS_META.cancelled;

const pad = (n) => String(n).padStart(2, '0');

export const toDateTimeLocal = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const formatTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

/** "in 12m", "4m ago", "just now" */
export const relativeTime = (value) => {
  if (!value) return '—';
  const diff = new Date(value).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const label =
    abs < 45000
      ? 'just now'
      : mins < 60
        ? `${mins}m`
        : abs < 86400000
          ? `${Math.floor(mins / 60)}h ${mins % 60}m`
          : `${Math.floor(mins / 1440)}d`;

  if (label === 'just now') return label;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
};

/** Countdown text for a future timestamp. */
export const countdown = (value) => {
  if (!value) return '—';
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) {
    const overdue = Math.abs(ms);
    const mins = Math.max(1, Math.round(overdue / 60000));
    return mins < 60 ? `${mins}m overdue` : `${Math.floor(mins / 60)}h ${mins % 60}m overdue`;
  }
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${pad(m)}m`;
  if (m) return `${m}m ${pad(s)}s`;
  return `${s}s`;
};

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';

export const isActiveStatus = (status) => ['active', 'overdue', 'sos'].includes(status);
