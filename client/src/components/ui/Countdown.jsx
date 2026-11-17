import { useEffect, useState } from 'react';
import { countdown } from '../../utils/format.js';

/** Live ticking countdown to (or past) a timestamp. */
export default function Countdown({ to, className = '' }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!to) return <span className={className}>—</span>;

  const overdue = new Date(to).getTime() <= now;
  return (
    <span className={`${overdue ? 'text-danger-600' : 'text-slate-900'} font-semibold ${className}`}>
      {countdown(to)}
    </span>
  );
}
