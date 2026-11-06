import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Mail, Phone, ReceiptText, UserRound, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { ticketTypes } from '../../data/events';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { sendNotification } from '../../lib/notifications';
import { useAvailability } from '../../hooks/useAvailability';

const initialForm = { name: '', email: '', phone: '', attendees: 1, ticket: 'general' };
const UPI_ID = (import.meta.env.VITE_UPI_ID || '').trim();
const upiConfigured = /^[a-zA-Z0-9][a-zA-Z0-9._-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(UPI_ID);

export default function RegistrationModal({ event, open, onClose }) {
  const { register, submitPaymentReference, markNotificationSent, cancelRegistration } = useApp();
  const { configured, user, session, loading } = useAuth();
  const [eligibility, setEligibility] = useState('checking');
  const { remaining, error: availabilityError, loading: availabilityLoading, refresh: refreshAvailability } = useAvailability(event?.id, open && Boolean(user));
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [hold, setHold] = useState(null);
  const [utr, setUtr] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [clockError, setClockError] = useState('');

  useEffect(() => { if (open) { setForm(initialForm); setErrors({}); setConfirmation(null); setHold(null); setUtr(''); setBusy(false); setSecondsLeft(null); setClockError(''); } }, [open, event?.id]);
  useEffect(() => {
    if (!open || !event || !configured || !user) { setEligibility('checking'); return undefined; }
    let active = true;
    setEligibility('checking');
    supabase.from('registrations').select('*').eq('user_id', user.id).eq('event_id', event.id).in('status', ['Pending', 'Confirmed']).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!active) return;
      if (error) { setEligibility('error'); return; }
      const existing = (data || []).find((r) => r.transaction_id !== 'AWAITING-UPI');
      const savedHold = (data || []).find((r) => r.transaction_id === 'AWAITING-UPI' && r.payment_hold_expires_at);
      if (existing) setEligibility('duplicate');
      else { if (savedHold) setHold({ ...savedHold, eventTitle: event.title }); setEligibility('eligible'); }
    }).catch(() => { if (active) setEligibility('error'); });
    return () => { active = false; };
  }, [open, event?.id, configured, user?.id]);
  useEffect(() => {
    if (!open || !hold) return undefined;
    let active = true, deadline = null, syncId = 0;
    const sync = async () => {
      const id = ++syncId;
      const started = performance.now();
      try {
        const { data, error } = await supabase.rpc('payment_hold_seconds', { p_registration_id: hold.id });
        if (!active || id !== syncId) return;
        if (error || typeof data !== 'number') throw error || new Error('Could not check hold');
        // Subtract the full request duration, so network latency cannot extend a hold.
        deadline = performance.now() + Math.max(0, data * 1000 - (performance.now() - started));
        setSecondsLeft(Math.max(0, Math.floor((deadline - performance.now()) / 1000))); setClockError('');
      } catch { if (active && id === syncId) { deadline = null; setSecondsLeft(null); setClockError('Cannot verify your hold. Do not pay until it can be checked.'); } }
    };
    const visible = () => { if (document.visibilityState === 'visible') { deadline = null; setSecondsLeft(null); sync(); } };
    setSecondsLeft(null); setClockError(''); sync();
    const timer = setInterval(() => { if (deadline !== null) setSecondsLeft(Math.max(0, Math.floor((deadline - performance.now()) / 1000))); }, 250);
    const refresh = setInterval(sync, 10000);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearInterval(timer); clearInterval(refresh); document.removeEventListener('visibilitychange', visible); };
  }, [open, hold?.id]);
  const ticket = ticketTypes.find((item) => item.id === form.ticket) || ticketTypes[0];
  const total = useMemo(() => Math.round((event?.price || 0) * ticket.priceMultiplier * Number(form.attendees || 1)), [event, ticket, form.attendees]);
  const validAttendees = Number.isInteger(Number(form.attendees)) && Number(form.attendees) >= 1 && Number(form.attendees) <= 8;
  if (!event || !open) return null;
  const expired = hold && secondsLeft === 0;
  const checkingHold = hold && secondsLeft === null;

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })); };
  const validate = () => {
    const next = {};
    if (!form.name.trim() || !/^[a-zA-Z][a-zA-Z .'-]{2,}$/.test(form.name.trim())) next.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!/^[+\d][\d\s-]{8,14}$/.test(form.phone)) next.phone = 'Enter a valid phone number.';
    if (!validAttendees) next.attendees = 'Choose between 1 and 8 attendees.';
    else if (Number(form.attendees) > remaining) next.attendees = 'Not enough seats remaining.';
    setErrors(next); return Object.keys(next).length === 0;
  };
  const notify = async (registration) => {
    try { await sendNotification('send-registration-request', registration.id, session.access_token); markNotificationSent(registration.id, 'request_email_sent_at'); }
    catch { toast.error('Request saved, but organizer notification failed. Contact the organizer with your reference.'); }
    try { await sendNotification('send-registration-receipt', registration.id, session.access_token); markNotificationSent(registration.id, 'receipt_email_sent_at'); }
    catch { toast.error('Request saved, but your receipt email failed. Retry from My Gatherly.'); }
  };
  const reserve = async (eventObject) => {
    eventObject.preventDefault();
    if (!validate()) return;
    if (total > 0 && !upiConfigured) { setErrors({ form: 'UPI payments are not configured. Please do not pay.' }); return; }
    setBusy(true);
    try {
      const result = await register({ ...form, name: form.name.trim(), email: form.email.trim(), eventId: event.id });
      if (result.error) { setErrors({ form: result.error }); return; }
      if (result.registration.total === 0) { setConfirmation(result.registration); await notify(result.registration); }
      else { setHold(result.registration); }
    } catch (error) { setErrors({ form: error.message || 'Could not reserve a seat. Please try again.' }); }
    finally { setBusy(false); }
  };
  const submitUtr = async (e) => {
    e.preventDefault(); const reference = utr.trim();
    if (reference.length < 6 || reference.length > 100 || ['AWAITING-UPI', 'FREE-EVENT'].includes(reference.toUpperCase())) { setErrors({ transactionId: 'Enter a valid UTR or transaction ID (6–100 characters).' }); return; }
    setBusy(true); setErrors({});
    try {
      const registration = await submitPaymentReference(hold.id, reference);
      setConfirmation(registration); setHold(null);
      if (registration.status === 'Pending') await notify(registration);
      else toast('Payment reported for manual refund review. Contact the organizer.');
    } catch (error) { setErrors({ form: error.message || 'Could not save the UTR. Please retry or contact the organizer.' }); }
    finally { setBusy(false); }
  };
  const abandon = async () => {
    if (!window.confirm('Only continue if you have NOT paid. If you already paid, submit your UTR instead. Release this hold?')) return;
    setBusy(true);
    try { if (hold.status === 'Pending') await cancelRegistration(hold.id); setHold(null); setErrors({}); refreshAvailability(); }
    catch (error) { setErrors({ form: error.message || 'Could not release the hold.' }); }
    finally { setBusy(false); }
  };
  const blockedMessage = loading ? 'Checking your session…' : !configured ? 'Registrations are unavailable until the organizer configures the service. Please do not pay.' : !user ? 'Please sign in using the navigation menu before making a payment.' : eligibility === 'checking' ? 'Checking your registration…' : eligibility === 'error' ? 'Could not check your registration. Please close and try again before paying.' : eligibility === 'duplicate' ? 'You already have an active registration for this event. Check My Gatherly before paying.' : !hold && (availabilityLoading || remaining === null && !availabilityError) ? 'Checking available seats…' : !hold && availabilityError ? 'Could not check availability. Please close and try again before paying.' : !hold && remaining === 0 ? 'This event is sold out or registration is closed. Please do not pay.' : null;
  return <Modal open={open} onClose={onClose} size="max-w-2xl" title="Register for event"><div className="p-6 sm:p-9">{confirmation ? <PendingConfirmation confirmation={confirmation} onClose={onClose} /> : blockedMessage ? <div className="pr-8"><h2 className="font-display text-2xl font-semibold">Registration unavailable</h2><p className="mt-4 text-sm">{blockedMessage}</p></div> : hold ? <>
    <div className="pr-8"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-coral">Your reservation · {hold.id}</p><h2 className="mt-2 font-display text-3xl font-semibold">{checkingHold ? 'Checking your hold…' : expired ? 'Your hold has expired.' : 'Your seats are temporarily held.'}</h2></div>
    <p className="mt-4 text-sm leading-6">{checkingHold ? (clockError || 'Checking the hold against the server clock. Please do not pay yet.') : expired ? 'Do not make a new payment. If you already paid, submit the UTR below for manual refund review. Your seat is not reserved.' : `Your ${hold.attendees} seat(s) are held for ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}. Pay and submit the UTR before the timer ends; approval is still manual.`}</p>
    <p className="mt-3 text-xs leading-5 text-ink/60 dark:text-cream/60">If payment completes after expiry or you submit late, your booking is not confirmed. Submit your UTR for manual refund review and contact the organizer. Refunds are not automatic.</p>
    {!checkingHold && !expired && (upiConfigured ? <div className="mt-5"><PaymentInstructions amount={hold.total} reference={hold.id} /></div> : <p className="mt-5 text-sm text-red-500">UPI details are unavailable. Please do not pay.</p>)}
    <form onSubmit={submitUtr} className="mt-6"><Field icon={ReceiptText} label="UPI transaction ID / UTR" value={utr} onChange={(value) => { setUtr(value); setErrors({}); }} placeholder="Example: 123456789012" error={errors.transactionId} />{errors.form && <p role="alert" className="mt-4 text-xs text-red-500">{errors.form}</p>}<div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} className="rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">{busy ? 'Saving…' : expired ? 'Report payment for refund review' : 'Submit payment reference'}</button><button type="button" disabled={busy} onClick={abandon} className="rounded-full border border-ink/20 px-5 py-3 text-xs font-bold disabled:opacity-50 dark:border-cream/20">I have not paid · release hold</button></div></form>
  </> : <>
    <div className="mb-7 pr-8"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-coral">Reserve your place</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">Join {event.title}</h2><p className="mt-2 text-sm text-ink/55 dark:text-cream/55">{total === 0 ? 'Submit your request and the organizer will confirm your seat.' : 'Enter your details first. We will hold your seats for up to 15 minutes (or until the event starts) before showing the UPI details.'}</p></div>
    <p className="mb-4 text-xs font-bold text-coral">{remaining} seats currently available. Availability is confirmed when you reserve.</p>
    {total > 0 && !upiConfigured && <p className="mb-4 rounded-xl bg-red-500/10 p-4 text-xs text-red-500">UPI payments are not configured. Please do not pay.</p>}
    <form onSubmit={reserve} noValidate><div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Field icon={UserRound} label="Full name" value={form.name} onChange={(value) => update('name', value)} placeholder="Aarav Sharma" error={errors.name} />
      <Field icon={Mail} label="Email address" type="email" value={form.email} onChange={(value) => update('email', value)} placeholder="you@email.com" error={errors.email} />
      <Field icon={Phone} label="Phone number" type="tel" value={form.phone} onChange={(value) => update('phone', value)} placeholder="+91 98765 43210" error={errors.phone} />
      <Field icon={Users} label="Attendees" type="number" value={form.attendees} onChange={(value) => update('attendees', value)} error={errors.attendees} />
    </div><div className="mt-6"><p className="mb-3 text-xs font-bold">Choose your pass</p><div className="grid gap-2 sm:grid-cols-3">{ticketTypes.map((option) => <button type="button" key={option.id} onClick={() => update('ticket', option.id)} className={`rounded-2xl border p-3 text-left transition ${form.ticket === option.id ? 'border-coral bg-coral/10' : 'border-ink/10 hover:border-coral/50 dark:border-cream/10'}`}><span className="flex items-center justify-between text-xs font-bold">{option.name}<span className="text-coral">₹{Math.round(event.price * option.priceMultiplier).toLocaleString('en-IN')}</span></span><span className="mt-1 block text-[10px] leading-4 text-ink/50 dark:text-cream/50">{option.description}</span></button>)}</div></div>{errors.form && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-500">{errors.form}</p>}<div className="mt-7 flex items-center justify-between border-t border-ink/10 pt-5 dark:border-cream/10"><div><p className="text-[10px] uppercase tracking-[.15em] text-ink/45 dark:text-cream/45">Estimated total</p><p className="font-display text-2xl font-bold">₹{total.toLocaleString('en-IN')}</p></div><button disabled={busy || !validAttendees || Number(form.attendees) > remaining || total > 0 && !upiConfigured} className="rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">{busy ? 'Reserving…' : total === 0 ? 'Submit free request' : 'Hold seats & continue'}</button></div></form></>}</div></Modal>;
}

function PaymentInstructions({ amount, reference }) { const uri = `upi://pay?${new URLSearchParams({ pa: UPI_ID, am: String(amount), cu: 'INR', tn: reference })}`; const copy = async () => { try { await navigator.clipboard.writeText(UPI_ID); toast.success('UPI ID copied.'); } catch { toast.error('Could not copy the UPI ID.'); } }; return <div className="flex flex-col gap-4 rounded-3xl border border-coral/25 bg-coral/5 p-4 sm:flex-row sm:items-center"><div className="grid shrink-0 place-items-center rounded-2xl bg-white p-2"><QRCodeSVG value={uri} size={128} /></div><div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-coral"><AlertCircle size={14} /> Complete UPI payment</p><p className="mt-2 text-sm font-bold">Scan to pay ₹{Number(amount).toLocaleString('en-IN')}</p><p className="mt-1 text-xs leading-5 text-ink/55 dark:text-cream/55">Check the recipient in your UPI app. Enter your UTR below for manual verification.</p><button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-[10px] font-bold text-cream dark:bg-citrus dark:text-ink">{UPI_ID} <Copy size={12} /></button></div></div>; }
function Field({ icon: Icon, label, value, onChange, placeholder, type = 'text', error }) { return <label className="text-xs font-bold">{label}<div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 dark:border-cream/10 dark:bg-cream/[.05]"><Icon size={16} className="text-coral" /><input required type={type} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 8 : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" placeholder={placeholder} /></div>{error && <span className="mt-1 block text-[11px] font-normal text-red-500">{error}</span>}</label>; }
function PendingConfirmation({ confirmation, onClose }) { const late = confirmation.refund_status === 'review' && confirmation.status === 'Cancelled'; return <div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-citrus text-ink"><Check size={30} /></div><p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-coral">{late ? 'Payment reported' : 'Request received'}</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">{late ? 'Refund review needed.' : confirmation.total === 0 ? 'We’ll review your request.' : 'We’ll check your payment.'}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink/60 dark:text-cream/60">{late ? 'Your hold expired or was released. Your seat is not reserved and refunds are not automatic. Contact the organizer with your reference and UTR.' : <>Your request for <strong className="text-ink dark:text-cream">{confirmation.eventTitle}</strong> is pending approval. The organizer must verify and approve it.</>}</p><div className="mx-auto mt-7 max-w-sm rounded-3xl border border-ink/10 bg-white/70 p-5 text-left dark:border-cream/10 dark:bg-cream/[.06]"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-coral">Reference</p><p className="mt-1 break-all font-display text-xl font-semibold">{confirmation.id}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/10 pt-4 text-xs dark:border-cream/10"><span>Status<br /><strong className="text-[#d88900]">{late ? 'Refund review' : 'Pending review'}</strong></span><span>{confirmation.total === 0 ? 'Payment' : 'UTR'}<br /><strong>{confirmation.total === 0 ? 'Free event' : confirmation.transactionId}</strong></span></div></div><button type="button" onClick={onClose} className="mt-6 rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream dark:bg-citrus dark:text-ink">Done</button></div>; }
