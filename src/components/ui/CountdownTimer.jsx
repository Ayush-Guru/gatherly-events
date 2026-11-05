import { Clock3 } from 'lucide-react';
import { useCountdown } from '../../hooks/useCountdown';

export default function CountdownTimer({ target, compact = false }) {
  const time = useCountdown(target);
  if (time.total <= 0) return <span className="inline-flex items-center gap-1.5 text-xs font-bold text-coral"><Clock3 size={14} /> Event started</span>;
  const values = [['days', time.days], ['hrs', time.hours], ['min', time.minutes], ['sec', time.seconds]];
  return <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'} text-ink dark:text-cream`} aria-label={`${time.days} days, ${time.hours} hours, ${time.minutes} minutes and ${time.seconds} seconds until event`}><Clock3 size={compact ? 13 : 15} className="text-coral" />{values.map(([label, value]) => <span key={label} className="flex items-baseline gap-0.5"><strong className={compact ? 'text-xs' : 'text-sm'}>{String(value).padStart(2, '0')}</strong><small className="text-[8px] uppercase text-ink/45 dark:text-cream/45">{label}</small></span>)}</div>;
}
