import { useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';

export default function Refunds() {
  const { registrations, updateRegistrationLocally } = useApp();
  const [busy, setBusy] = useState(false);
  const pending = registrations.filter((item) => item.refund_status === 'review');
  const mark = async (item) => {
    if (!window.confirm('Have you verified the payment and completed the refund outside Gatherly? This does not transfer money.')) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('mark_refund_complete', { registration_id: item.id }).single();
      if (error) throw error;
      updateRegistrationLocally(data); toast.success('Refund marked complete.');
    } catch (err) { toast.error(err.message || 'Could not update refund.'); }
    finally { setBusy(false); }
  };
  return <section className="mt-12"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-coral">Manual payments</p><h2 className="mt-2 font-display text-2xl font-semibold">Refund review</h2><p className="mt-2 text-xs leading-5 text-ink/55 dark:text-cream/55">Verify the UTR and arrange any eligible refund outside Gatherly. Mark complete only after the money is returned; this button does not transfer funds.</p><div className="mt-4 space-y-3">{pending.length === 0 ? <p className="rounded-2xl border border-dashed border-ink/15 p-5 text-sm text-ink/50 dark:border-cream/15 dark:text-cream/50">No refunds awaiting review.</p> : pending.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink/10 p-5 dark:border-cream/10"><div className="text-xs leading-6"><strong>{item.eventTitle} · {item.name}</strong><p>{item.id} · {item.status} · ₹{item.total} · UTR {item.transactionId}</p><p>{item.email} · {item.phone}</p></div><button type="button" disabled={busy} onClick={() => mark(item)} className="rounded-full border border-ink/20 px-4 py-3 text-xs font-bold disabled:opacity-50 dark:border-cream/20">Mark refund complete</button></article>)}</div></section>;
}
