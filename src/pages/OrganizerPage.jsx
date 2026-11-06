import { useState } from 'react';
import { BarChart3, Check, Edit3, Eye, Mail, Plus, Save, Trash2, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import SectionHeading from '../components/ui/SectionHeading';
import Modal from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { sendNotification } from '../lib/notifications';
import HostRequests from '../components/organizer/HostRequests';
import TicketCheckIn from '../components/organizer/TicketCheckIn';
import Refunds from '../components/organizer/Refunds';
import EmailRetries from '../components/organizer/EmailRetries';
import { supabase } from '../lib/supabase';

const localDateTime = (value) => { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

const emptyEvent = { title: '', category: 'Design', date: '2027-03-20T10:00', endDate: '2027-03-20T17:00', venue: '', city: 'Mumbai', type: 'In person', price: 499, capacity: 200, image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=85', description: '', longDescription: '', agenda: ['10:00 — Doors open', '12:00 — Main session', '15:00 — Community wrap'], speakers: [], tags: ['New event'] };

export default function OrganizerPage() {
  const { user, session, isOrganizer, loading, profileLoading, configured } = useAuth();
  const { events, registrations, addEvent, updateEvent, deleteEvent, approveRegistration, rejectRegistration, markNotificationSent } = useApp();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyEvent);
  const [uploading, setUploading] = useState(false);
  const uploadImage = async (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error('Choose a JPG, PNG or WebP image under 5 MB.'); return; }
    setUploading(true);
    try {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('event-images').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('event-images').getPublicUrl(path);
      setForm((current) => ({ ...current, image: data.publicUrl, gallery: [data.publicUrl] }));
      toast.success('Image uploaded. Save the event to use it.');
    } catch (err) { toast.error(err.message || 'Image upload failed.'); }
    finally { setUploading(false); }
  };
  const pending = registrations.filter((registration) => registration.status === 'Pending' && registration.transaction_id !== 'AWAITING-UPI');
  const openCreate = () => { setForm(emptyEvent); setEditing('new'); };
  const openEdit = (event) => { setForm({ ...event, date: localDateTime(event.date), endDate: localDateTime(event.endDate) }); setEditing(event.id); };
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const review = async (registration, approved) => {
    try {
      await (approved ? approveRegistration(registration.id) : rejectRegistration(registration.id));
      toast.success(approved ? 'Request accepted and ticket activated.' : 'Request rejected.');
      try { await sendNotification('send-registration-status-email', registration.id, session.access_token); markNotificationSent(registration.id, 'status_email_sent_at'); }
      catch { toast.error('Review saved, but the email failed. Please contact the attendee.'); }
    } catch (error) { toast.error(error.message || 'Could not review this request.'); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.venue.trim() || !form.description.trim() || !form.city.trim()) { toast.error('Add a title, venue, city, and description first.'); return; }
    if (!form.date || !form.endDate || new Date(form.endDate) <= new Date(form.date) || !Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1 || !Number.isInteger(Number(form.price)) || Number(form.price) < 0) { toast.error('Enter valid dates, price, and capacity. End must be after start.'); return; }
    try { if (editing === 'new') await addEvent(form); else await updateEvent(form); setEditing(null); toast.success(editing === 'new' ? 'Event created.' : 'Event updated.'); }
    catch (error) { toast.error(error.message || 'Could not save event.'); }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    try { await deleteEvent(id); toast.success('Event removed.'); }
    catch (error) { toast.error(error.message || 'Could not delete event.'); }
  };
  const totalAttendees = registrations.filter((item) => item.status === 'Confirmed').reduce((sum, item) => sum + Number(item.attendees || 1), 0);

  if (loading || profileLoading) return <main className="mx-auto min-h-screen w-[min(1180px,calc(100%-32px))] py-20">Checking organizer access…</main>;
  if (!configured || !user || !isOrganizer) return <main className="mx-auto min-h-screen w-[min(1180px,calc(100%-32px))] py-20"><h1 className="font-display text-3xl font-semibold">Organizer access required</h1><p className="mt-4 text-sm">{!configured ? 'Organizer tools are unavailable until Supabase is configured.' : !user ? 'Please sign in with an organizer account.' : 'This account does not have organizer access.'}</p></main>;

  return <main className="mx-auto min-h-screen w-[min(1180px,calc(100%-32px))] py-12 sm:py-20"><SectionHeading eyebrow="Organizer studio" title="Make something people want to show up for." description="Review UPI payment requests, approve tickets, and manage your Gatherly event catalogue." action={<button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-xs font-bold text-cream dark:bg-citrus dark:text-ink"><Plus size={15} /> Create event</button>} /><div className="grid gap-4 sm:grid-cols-3"><Stat icon={BarChart3} label="Live events" value={events.length} /><Stat icon={Users} label="Confirmed attendees" value={totalAttendees} /><Stat icon={Eye} label="Pending reviews" value={pending.length} /></div><HostRequests /><TicketCheckIn /><Refunds /><EmailRetries /><section className="mt-12"><div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-coral">UPI verification</p><h2 className="mt-2 font-display text-2xl font-semibold tracking-[-.05em]">Payment requests</h2></div><a href="mailto:ayushguru16@gmail.com" className="inline-flex items-center gap-2 text-xs font-bold text-coral hover:underline"><Mail size={14} /> ayushguru16@gmail.com</a></div>{pending.length === 0 ? <div className="rounded-3xl border border-dashed border-ink/15 p-8 text-center text-sm text-ink/50 dark:border-cream/15 dark:text-cream/50">No pending payment requests right now.</div> : <div className="space-y-3">{pending.map((registration) => <RequestCard key={registration.id} registration={registration} onApprove={() => review(registration, true)} onReject={() => review(registration, false)} />)}</div>}</section><section className="mt-14 overflow-hidden rounded-3xl border border-ink/10 bg-white/60 dark:border-cream/10 dark:bg-cream/[.05]"><div className="flex items-center justify-between border-b border-ink/10 p-5 dark:border-cream/10"><div><h2 className="font-display text-xl font-semibold">Your event catalogue</h2><p className="mt-1 text-xs text-ink/50 dark:text-cream/50">Changes are saved to your event catalogue.</p></div><span className="rounded-full bg-citrus px-3 py-1.5 text-[10px] font-bold text-ink">{events.length} events</span></div><div className="divide-y divide-ink/10 dark:divide-cream/10">{events.map((event) => <div key={event.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex items-center gap-4"><img src={event.image} alt="" className="h-16 w-20 rounded-xl object-cover" /><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-coral">{event.category} · {event.city}</p><h3 className="mt-1 font-display font-semibold">{event.title}</h3><p className="mt-1 text-xs text-ink/50 dark:text-cream/50">{event.attendees} / {event.capacity} confirmed · ₹{event.price}</p></div></div><div className="flex gap-2"><button type="button" onClick={() => openEdit(event)} className="grid h-9 w-9 place-items-center rounded-full border border-ink/10 hover:border-coral hover:text-coral dark:border-cream/10" aria-label={`Edit ${event.title}`}><Edit3 size={14} /></button><button type="button" onClick={() => remove(event.id)} className="grid h-9 w-9 place-items-center rounded-full border border-red-500/20 text-red-500" aria-label={`Delete ${event.title}`}><Trash2 size={14} /></button></div></div>)}</div></section><Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Event editor"><form onSubmit={submit} className="p-7 sm:p-9"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-coral">{editing === 'new' ? 'New gathering' : 'Edit gathering'}</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">Shape the details.</h2><div className="mt-7 grid gap-4 sm:grid-cols-2"><Field label="Title" value={form.title} onChange={(value) => update('title', value)} placeholder="A beautiful event name" wide /><Field label="Venue" value={form.venue} onChange={(value) => update('venue', value)} placeholder="The Studio Hall" /><Field label="City" value={form.city} onChange={(value) => update('city', value)} placeholder="Mumbai" /><label className="text-xs font-bold">Category<select value={form.category} onChange={(event) => update('category', event.target.value)} className="mt-2 w-full rounded-xl border border-ink/10 bg-transparent px-3 py-3 text-sm font-normal outline-none dark:border-cream/10">{['Design', 'Technology', 'Culture', 'Music', 'Community', 'Food'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-bold">Start date<input type="datetime-local" value={form.date} onChange={(event) => update('date', event.target.value)} className="mt-2 w-full rounded-xl border border-ink/10 bg-transparent px-3 py-3 text-sm font-normal outline-none dark:border-cream/10" /></label><label className="text-xs font-bold">End date<input type="datetime-local" value={form.endDate} onChange={(event) => update('endDate', event.target.value)} className="mt-2 w-full rounded-xl border border-ink/10 bg-transparent px-3 py-3 text-sm font-normal outline-none dark:border-cream/10" /></label><Field label="Price" value={form.price} onChange={(value) => update('price', value)} type="number" /><Field label="Capacity" value={form.capacity} onChange={(value) => update('capacity', value)} type="number" /><Field label="Image URL" value={form.image} onChange={(value) => setForm((current) => ({ ...current, image: value, gallery: [value] }))} placeholder="https://images.unsplash.com/..." wide /><label className="text-xs font-bold sm:col-span-2">Or upload an event image (JPG, PNG or WebP; max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => uploadImage(event.target.files?.[0])} className="mt-2 block w-full text-sm" />{uploading && <span>Uploading…</span>}</label><label className="text-xs font-bold sm:col-span-2">Description<textarea value={form.description} onChange={(event) => update('description', event.target.value)} rows="3" className="mt-2 w-full resize-y rounded-xl border border-ink/10 bg-transparent px-3 py-3 text-sm font-normal outline-none dark:border-cream/10" placeholder="What will people experience?" /></label></div><div className="mt-7 flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-full border border-ink/10 px-5 py-3 text-xs font-bold dark:border-cream/10">Cancel</button><button disabled={uploading} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink"><Save size={14} /> Save event</button></div></form></Modal></main>;
}

function RequestCard({ registration, onApprove, onReject }) { return <article className="grid gap-4 rounded-3xl border border-[#efc66b]/40 bg-[#fff8e8] p-5 dark:border-[#efc66b]/30 dark:bg-[#3a301c] sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#b87800]">{registration.id} · {registration.eventTitle}</p><h3 className="mt-2 font-display text-lg font-semibold">{registration.name}</h3><p className="mt-1 text-xs text-ink/55 dark:text-cream/55">{registration.email} · {registration.phone} · {registration.attendees} attendee(s)</p><div className="mt-3 flex flex-wrap gap-3 text-xs"><span><strong>Amount:</strong> ₹{Number(registration.total).toLocaleString('en-IN')}</span><span><strong>UTR:</strong> {registration.transactionId || registration.transaction_id || 'Not provided'}</span></div></div><div className="flex gap-2"><button type="button" onClick={onReject} className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 px-4 py-3 text-xs font-bold text-red-500"><X size={14} /> Reject</button><button type="button" onClick={onApprove} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-3 text-xs font-bold text-cream dark:bg-citrus dark:text-ink"><Check size={14} /> {Number(registration.total) === 0 ? 'Confirm free booking' : 'Accept payment'}</button></div></article>; }
function Field({ label, value, onChange, placeholder, type = 'text', wide = false }) { return <label className={`text-xs font-bold ${wide ? 'sm:col-span-2' : ''}`}>{label}<input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-ink/10 bg-transparent px-3 py-3 text-sm font-normal outline-none dark:border-cream/10" /></label>; }
function Stat({ icon: Icon, label, value }) { return <div className="rounded-3xl border border-ink/10 bg-white/60 p-5 dark:border-cream/10 dark:bg-cream/[.05]"><Icon className="text-coral" size={20} /><p className="mt-5 text-[10px] font-bold uppercase tracking-[.16em] text-ink/45 dark:text-cream/45">{label}</p><p className="mt-1 font-display text-3xl font-semibold">{value}</p></div>; }
