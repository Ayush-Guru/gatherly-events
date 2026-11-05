import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useAvailability(eventId, enabled = true) {
  const [remaining, setRemaining] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(supabase && enabled));
  useEffect(() => {
    if (!supabase || !eventId || !enabled) { setRemaining(null); setError(''); setLoading(false); return undefined; }
    let active = true;
    setLoading(true); setError(''); setRemaining(null);
    supabase.rpc('get_event_availability', { p_event_id: eventId }).then(({ data, error: rpcError }) => {
      if (!active) return;
      if (rpcError || typeof data !== 'number') setError('Could not check remaining seats.'); else setRemaining(data);
      setLoading(false);
    }).catch(() => { if (active) { setError('Could not check remaining seats.'); setLoading(false); } });
    return () => { active = false; };
  }, [eventId, enabled]);
  return { remaining, error, loading };
}
