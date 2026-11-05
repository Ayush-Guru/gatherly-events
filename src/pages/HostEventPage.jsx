import { useEffect, useState } from 'react';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { sendNotification } from '../lib/notifications';

const initial = { contact_name: '', contact_email: '', contact_phone: '', title: '', category: 'Community', event_date: '', city: '', venue: '', details: '' };
const inputClass = 'mt-2 w-full rounded-xl border border-ink/10 bg-white/60 px-3 py-3 text-sm font-normal outline-none dark:border-cream/10 dark:bg-cream/[.05]';
export default function HostEventPage() {
  const { configured, user, session, loading } = useAuth();
  const [form, setForm] = useState(initial);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState('');
  useEffect(() => {
    if (!supabase || !user) { setRequests([]); return undefined; }
    let active = true;
    setListError(''); setRequests([]);
    supabase.from('event_host_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setListError('Could not load your requests. Please refresh and try again.'); else setRequests(data || []);
    }).catch(() => { if (active) setListError('Could not load your requests. Please refresh and try again.'); });
    return () => { active = false; };
  }, [user?.id]);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const retryNotification = async (request) => {
    setBusy(true); setNotice('');
    try { await sendNotification('send-host-request', request.id, session.access_token); setRequests((current) => current.map((item) => item.id === request.id ? { ...item, notify_email_sent_at: new Date().toISOString() } : item)); setNotice('Organizer notification sent.'); }
    catch { setNotice('Could not send the notification or it was already sent. Your request remains visible in Organizer Studio.'); }
    finally { setBusy(false); }
  };
  const submit = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    if (!user || !supabase) { setError('Please sign in before submitting.'); return; }
    if (Object.values(form).some((value) => !value.trim())) { setError('Please fill in all fields.'); return; }
    if (new Date(form.event_date).getTime() <= Date.now() || Number.isNaN(new Date(form.event_date).getTime())) { setError('Choose a future event date.'); return; }
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
      payload.event_date = new Date(form.event_date).toISOString();
      const { data, error: insertError } = await supabase.from('event_host_requests').insert({ ...payload, user_id: user.id }).select().single();
      if (insertError) throw insertError;
      setRequests((current) => [data, ...current]); setForm(initial);
      setNotice('Request submitted! The Gatherly team will review it. Check its status below. Approval does not automatically publish the event.');
      try { await sendNotification('send-host-request', data.id, session.access_token); setRequests((current) => current.map((item) => item.id === data.id ? { ...item, notify_email_sent_at: new Date().toISOString() } : item)); }
      catch { setNotice('Request submitted and visible in Organizer Studio, but the email notification failed. You may also contact the organizer.'); }
    } catch (err) { setError(err.message || 'Could not submit the request. Please try again.'); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto min-h-screen w-[min(1000px,calc(100%-32px))] py-12 sm:py-20"><div className="max-w-2xl"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-coral"><CalendarPlus size={15} /> Host with Gatherly</p><h1 className="mt-3 font-display text-5xl font-semibold tracking-[-.08em] sm:text-6xl">Have a gathering in mind?</h1><p className="mt-5 text-sm leading-7 text-ink/60 dark:text-cream/60">Tell us about your event. Our team reviews each request and contacts you to discuss the details. Approval alone does not publish your event.</p></div>
    {loading ? <p className="mt-10 text-sm">Checking your account…</p> : !configured || !user ? <div className="mt-10 rounded-3xl border border-ink/10 p-6 text-sm dark:border-cream/10">{!configured ? 'Event requests are unavailable until Supabase is configured.' : 'Please sign in using the navigation menu to submit a host request.'}</div> : <><form onSubmit={submit} className="mt-10 rounded-3xl border border-ink/10 bg-white/60 p-6 shadow-soft dark:border-cream/10 dark:bg-cream/[.05] sm:p-8"><h2 className="font-display text-2xl font-semibold">Your event request</h2><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Your name" value={form.contact_name} onChange={(v) => change('contact_name', v)} minLength={2} maxLength={120} /><Field label="Contact email" type="email" value={form.contact_email} onChange={(v) => change('contact_email', v)} maxLength={254} /><Field label="Contact phone" type="tel" value={form.contact_phone} onChange={(v) => change('contact_phone', v)} minLength={8} maxLength={30} /><Field label="Event title" value={form.title} onChange={(v) => change('title', v)} minLength={3} maxLength={160} /><label className="text-xs font-bold">Category<select className={inputClass} value={form.category} onChange={(e) => change('category', e.target.value)}>{['Design', 'Technology', 'Culture', 'Music', 'Community', 'Food'].map((category) => <option key={category}>{category}</option>)}</select></label><Field label="Event date and time" type="datetime-local" value={form.event_date} onChange={(v) => change('event_date', v)} /><Field label="City" value={form.city} onChange={(v) => change('city', v)} minLength={2} maxLength={100} /><Field label="Venue" value={form.venue} onChange={(v) => change('venue', v)} minLength={2} maxLength={200} /><label className="text-xs font-bold sm:col-span-2">Tell us about your event<textarea required minLength={10} maxLength={3000} rows="4" className={inputClass} value={form.details} onChange={(e) => change('details', e.target.value)} placeholder="What are you planning? Include estimated attendance, pricing and anything we should know." /></label></div>{error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-500">{error}</p>}{notice && <p role="status" className="mt-4 rounded-xl bg-citrus/40 p-3 text-xs leading-5 text-ink">{notice}</p>}<button disabled={busy} className="mt-6 rounded-full bg-ink px-6 py-3 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">{busy ? 'Submitting…' : 'Submit event request'}</button></form><section className="mt-12"><h2 className="font-display text-2xl font-semibold">Your host requests</h2><p className="mt-2 text-xs text-ink/55 dark:text-cream/55">Status updates appear here. The team will contact you using the details you provided.</p>{listError && <p role="alert" className="mt-4 text-sm text-red-500">{listError}</p>}<div className="mt-5 space-y-3">{requests.length === 0 && !listError ? <p className="rounded-2xl border border-dashed border-ink/15 p-5 text-sm text-ink/50 dark:border-cream/15 dark:text-cream/50">No host requests yet.</p> : requests.map((request) => <article key={request.id} className="rounded-2xl border border-ink/10 p-5 dark:border-cream/10"><p className="flex items-center gap-2 text-xs font-bold text-coral"><CheckCircle2 size={14} /> {request.status}</p><h3 className="mt-2 font-display text-lg font-semibold">{request.title}</h3><p className="mt-1 text-xs text-ink/55 dark:text-cream/55">{request.city} · {new Date(request.event_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>{request.status === 'Pending' && !request.notify_email_sent_at && <button type="button" disabled={busy} onClick={() => retryNotification(request)} className="mt-3 block text-xs font-bold text-coral underline disabled:opacity-50">Retry organizer email</button>}{request.published_event_id && <Link to={`/events/${request.published_event_id}`} className="mt-3 inline-block text-xs font-bold text-coral underline">View your published event</Link>}</article>)}</div></section></>}
  </main>;
}
function Field({ label, value, onChange, type = 'text', minLength, maxLength }) { return <label className="text-xs font-bold">{label}<input required type={type} minLength={minLength} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>; }
