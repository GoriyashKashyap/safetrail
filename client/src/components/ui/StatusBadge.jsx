import { statusMeta } from '../../utils/format.js';

export default function StatusBadge({ status, className = '' }) {
  const meta = statusMeta(status);
  return (
    <span className={`${meta.badge} ${className}`}>
      <span className={`${meta.dot} !w-1.5 !h-1.5`} />
      {meta.label}
    </span>
  );
}
