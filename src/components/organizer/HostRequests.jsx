import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { getNotificationToken, sendNotification } from '../../lib/notifications';
import Modal from '../ui/Modal';

const defaultImage = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=85';
export default function HostRequests() {
  const { user } = useAuth();
  const { loadEvents } = useApp();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [publishing, setPublishing] = useState(null);
  const [publishForm, setPublishForm] = useState({ price: 0, capacity: 100, image: defaultImage });
  const load = async () => {
    setLoading(true); setError('');
    try { const { data, error: queryError } = await supabase.from('event_host_requests').select('*').order('created_at', { ascending: false }); if (queryError) throw queryError; setRequests(data || []); }
    catch { setError('Could not load host requests. Check your database setup and try again.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const sendStatus = async (request) => {
    const token = await getNotificationToken(supabase);
    await sendNotification('send-host-status-email', request.id, token);
    setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status_email_sent_at: new Date().toISOString() } : item));
  };
  const review = async (request, decision) => {
    setBusy(request.id);
    try {
      const { data, error: reviewError } = await supabase.rpc('review_host_request', { request_id: request.id, decision }).single();
      if (reviewError) throw reviewError;
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, ...data } : item));
      toast.success(`Request ${decision.toLowerCase()}. Contact the host to follow up.`);
      try { await sendStatus(request); } catch (err) { toast.error(`Review saved. ${err.message}`, { duration: 8000 }); }
    } catch (err) { toast.error(err.message || 'Could not review the request.'); }
    finally { setBusy(null); }
  };
  const retry = async (request) => { setBusy(request.id); try { await sendStatus(request); toast.success('Host notification sent.'); } catch (err) { toast.error(err.message || 'Could not send email. Try again.', { duration: 8000 }); } finally { setBusy(null); } };
  const publish = async (event) => {
    event.preventDefault(); setBusy(publishing.id);
    try {
      const { data, error: rpcError } = await supabase.rpc('publish_host_request', { request_id: publishing.id, event_price: Number(publishForm.price), event_capacity: Number(publishForm.capacity), event_image: publishForm.image.trim() });
      if (rpcError) throw rpcError;
      setRequests((current) => current.map((item) => item.id === publishing.id ? { ...item, published_event_id: data } : item));
      setPublishing(null); await loadEvents(); toast.success('Event published.');
    } catch (err) { toast.error(err.message || 'Could not publish event.'); }
    finally { setBusy(null); }
  };
  return <section className="mt-12"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-coral">Community submissions</p><h2 className="mt-2 font-display text-2xl font-semibold">Host event requests</h2><p className="mt-2 text-xs text-ink/55 dark:text-cream/55">Review requests, contact hosts, and publish only after agreeing on the details. All published event payments use the configured Gatherly UPI account.</p><div className="mt-5 space-y-3">{loading ? <p className="text-sm">Loading host requests…</p> : error ? <div role="alert" className="text-sm text-red-500">{error} <button onClick={load} className="font-bold underline">Retry</button></div> : requests.length === 0 ? <div className="rounded-3xl border border-dashed border-ink/15 p-8 text-center text-sm text-ink/50 dark:border-cream/15 dark:text-cream/50">No host requests yet.</div> : requests.map((request) => <article key={request.id} className="rounded-3xl border border-ink/10 bg-white/60 p-5 dark:border-cream/10 dark:bg-cream/[.05]"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-coral">{request.status} · {request.category} · {request.city}</p><h3 className="mt-2 font-display text-xl font-semibold">{request.title}</h3><p className="mt-2 text-xs leading-5 text-ink/60 dark:text-cream/60">{new Date(request.event_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {request.venue}</p><p className="mt-2 text-xs leading-5">{request.contact_name} · <a href={`mailto:${request.contact_email}`} className="text-coral underline">{request.contact_email}</a> · {request.contact_phone}</p>{request.published_event_id && <Link to={`/events/${request.published_event_id}`} className="mt-2 inline-block text-xs font-bold text-coral underline">View published event</Link>}</div><div className="flex flex-wrap gap-2">{request.user_id === user.id ? <span className="text-xs">Another organizer must review and publish your request.</span> : <>{request.status === 'Pending' && <><button type="button" disabled={Boolean(busy)} onClick={() => review(request, 'Declined')} className="rounded-full border border-red-500/25 px-4 py-3 text-xs font-bold text-red-500 disabled:opacity-50">Decline</button><button type="button" disabled={Boolean(busy)} onClick={() => review(request, 'Approved')} className="rounded-full bg-ink px-4 py-3 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">Approve request</button></>}{request.status === 'Approved' && !request.published_event_id && <button type="button" disabled={Boolean(busy)} onClick={() => { setPublishForm({ price: 0, capacity: 100, image: defaultImage }); setPublishing(request); }} className="rounded-full bg-ink px-4 py-3 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">Publish event</button>}{request.status !== 'Pending' && !request.status_email_sent_at && <button type="button" disabled={Boolean(busy)} onClick={() => retry(request)} className="rounded-full border border-ink/20 px-4 py-3 text-xs font-bold disabled:opacity-50 dark:border-cream/20">Retry host email</button>}</>}</div></div><p className="mt-4 whitespace-pre-wrap break-words border-t border-ink/10 pt-4 text-sm leading-6 text-ink/65 dark:border-cream/10 dark:text-cream/65">{request.details}</p></article>)}</div><Modal open={Boolean(publishing)} onClose={() => setPublishing(null)} title="Publish approved event" size="max-w-md"><form onSubmit={publish} className="space-y-4 p-7"><h3 className="pr-8 font-display text-2xl font-semibold">Publish {publishing?.title}</h3><p className="text-xs leading-5">Confirm these details with the host first. Payments go to Gatherly’s configured UPI account. Default duration is two hours; edit the event afterwards if needed.</p><label className="block text-xs font-bold">Price in ₹<input type="number" min="0" step="1" required value={publishForm.price} onChange={(e) => setPublishForm({ ...publishForm, price: e.target.value })} className="mt-2 w-full rounded-xl border border-ink/10 bg-transparent p-3 dark:border-cream/10" /></label><label className="block text-xs font-bold">Capacity<input type="number" min="1" step="1" required value={publishForm.capacity} onChange={(e) => setPublishForm({ ...publishForm, capacity: e.target.value })} className="mt-2 w-full rounded-xl border border-ink/10 bg-transparent p-3 dark:border-cream/10" /></label><label className="block text-xs font-bold">Image URL<input type="url" required value={publishForm.image} onChange={(e) => setPublishForm({ ...publishForm, image: e.target.value })} className="mt-2 w-full rounded-xl border border-ink/10 bg-transparent p-3 dark:border-cream/10" /></label><button disabled={Boolean(busy)} className="rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">Publish event</button></form></Modal></section>;
}
