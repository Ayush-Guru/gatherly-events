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

const initialForm = { name: '', email: '', phone: '', attendees: 1, ticket: 'general', transactionId: '' };
const UPI_ID = import.meta.env.VITE_UPI_ID || '7587704110@fam';

export default function RegistrationModal({ event, open, onClose }) {
  const { register, markNotificationSent } = useApp();
  const { configured, user, session, loading } = useAuth();
  const [eligibility, setEligibility] = useState('checking');
  const { remaining, error: availabilityError, loading: availabilityLoading } = useAvailability(event?.id, open && Boolean(user));
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setForm(initialForm); setErrors({}); setConfirmation(null); setBusy(false); } }, [open, event]);
  useEffect(() => {
    if (!open || !event || !configured || !user) { setEligibility('checking'); return undefined; }
    let active = true;
    setEligibility('checking');
    supabase.from('registrations').select('id').eq('user_id', user.id).eq('event_id', event.id).in('status', ['Pending', 'Confirmed']).limit(1).then(({ data, error }) => {
      if (active) setEligibility(error ? 'error' : data.length ? 'duplicate' : 'eligible');
    }).catch(() => { if (active) setEligibility('error'); });
    return () => { active = false; };
  }, [open, event?.id, configured, user?.id]);
  const ticket = ticketTypes.find((item) => item.id === form.ticket) || ticketTypes[0];
  const total = useMemo(() => Math.round((event?.price || 0) * ticket.priceMultiplier * Number(form.attendees || 1)), [event, ticket, form.attendees]);
  const validAttendees = Number.isInteger(Number(form.attendees)) && Number(form.attendees) >= 1 && Number(form.attendees) <= 8;
  if (!event || !open) return null;

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })); };
  const validate = () => {
    const next = {};
    if (!form.name.trim() || !/^[a-zA-Z][a-zA-Z .'-]{2,}$/.test(form.name.trim())) next.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (!/^[+\d][\d\s-]{8,14}$/.test(form.phone)) next.phone = 'Enter a valid phone number.';
    if (!Number.isInteger(Number(form.attendees)) || Number(form.attendees) < 1 || Number(form.attendees) > 8) next.attendees = 'Choose between 1 and 8 attendees.';
    if (Number(form.attendees) > remaining) next.attendees = 'Not enough seats remaining.';
    if (total > 0 && form.transactionId.trim().length < 6) next.transactionId = 'Enter the UTR or transaction ID after payment.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (eventObject) => {
    eventObject.preventDefault();
    if (!validate()) return;
    setBusy(true);
    const details = { ...form, name: form.name.trim(), transactionId: total === 0 ? 'FREE-EVENT' : form.transactionId.trim(), eventId: event.id, eventTitle: event.title, total };
    try {
      const result = await register(details);
      if (result.error) { setErrors({ form: result.error }); return; }
      setConfirmation(result.registration); toast.success('Request saved for review.');
      try { await sendNotification('send-registration-request', result.registration.id, session.access_token); markNotificationSent(result.registration.id, 'request_email_sent_at'); }
      catch { toast.error('Request saved, but organizer notification failed. Please contact the organizer with your reference.'); }
      try { await sendNotification('send-registration-receipt', result.registration.id, session.access_token); markNotificationSent(result.registration.id, 'receipt_email_sent_at'); }
      catch { toast.error('Request saved, but your receipt email failed. You can retry from My Gatherly.'); }
    } catch (error) { setErrors({ form: error.message || 'Could not submit your request. Please try again.' }); }
    finally { setBusy(false); }
  };

  const blockedMessage = loading ? 'Checking your session…' : !configured ? 'Registrations are unavailable until the organizer configures the service. Please do not pay.' : !user ? 'Please sign in using the navigation menu before making a payment.' : eligibility === 'checking' ? 'Checking your registration…' : eligibility === 'error' ? 'Could not check your registration. Please close and try again before paying.' : eligibility === 'duplicate' ? 'You already have an active registration for this event. Check My Gatherly before paying.' : availabilityLoading || remaining === null && !availabilityError ? 'Checking available seats…' : availabilityError ? 'Could not check availability. Please close and try again before paying.' : remaining === 0 ? 'This event is sold out or registration is closed. Please do not pay.' : null;
  return <Modal open={open} onClose={onClose} size="max-w-2xl"><div className="p-6 sm:p-9">{confirmation ? <PendingConfirmation confirmation={confirmation} onClose={onClose} /> : blockedMessage ? <div className="pr-8"><h2 className="font-display text-2xl font-semibold">Registration unavailable</h2><p className="mt-4 text-sm">{blockedMessage}</p></div> : <>
    <div className="mb-7 pr-8"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-coral">Reserve your place</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">Join {event.title}</h2><p className="mt-2 text-sm text-ink/55 dark:text-cream/55">{total === 0 ? 'Submit your request and the organizer will confirm your seat.' : 'Pay by UPI, submit your UTR, and we’ll confirm your seat after checking the payment.'}</p></div>
    <p className="mb-4 text-xs font-bold text-coral">{remaining} seats currently available. Pending requests hold seats after submission, not while you pay.</p><p className="mb-4 text-xs leading-5 text-ink/60 dark:text-cream/60">Availability can change before you submit. If payment succeeds but the event sells out, contact the organizer with your UTR for a manual refund. Cancellation or rejection is reviewed for a manual refund; no refund is automatic.</p>{!validAttendees ? <p className="rounded-xl bg-red-500/10 p-4 text-xs text-red-500">Choose a whole number between 1 and 8 attendees before paying.</p> : total === 0 ? <p className="rounded-xl bg-citrus/30 p-4 text-xs">This event is free. No payment or UTR is required.</p> : Number(form.attendees) > remaining ? <p className="rounded-xl bg-red-500/10 p-4 text-xs text-red-500">Not enough seats for this group. Reduce the number of attendees before paying.</p> : <PaymentInstructions amount={total} />}
    <form onSubmit={submit} noValidate><div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Field icon={UserRound} label="Full name" value={form.name} onChange={(value) => update('name', value)} placeholder="Aarav Sharma" error={errors.name} />
      <Field icon={Mail} label="Email address" type="email" value={form.email} onChange={(value) => update('email', value)} placeholder="you@email.com" error={errors.email} />
      <Field icon={Phone} label="Phone number" type="tel" value={form.phone} onChange={(value) => update('phone', value)} placeholder="+91 98765 43210" error={errors.phone} />
      <Field icon={Users} label="Attendees" type="number" value={form.attendees} onChange={(value) => update('attendees', value)} error={errors.attendees} />
      {total > 0 && <div className="sm:col-span-2"><Field icon={ReceiptText} label="UPI transaction ID / UTR" value={form.transactionId} onChange={(value) => update('transactionId', value)} placeholder="Example: 123456789012" error={errors.transactionId} /></div>}
    </div><div className="mt-6"><p className="mb-3 text-xs font-bold">Choose your pass</p><div className="grid gap-2 sm:grid-cols-3">{ticketTypes.map((option) => <button type="button" key={option.id} onClick={() => update('ticket', option.id)} className={`rounded-2xl border p-3 text-left transition ${form.ticket === option.id ? 'border-coral bg-coral/10' : 'border-ink/10 hover:border-coral/50 dark:border-cream/10'}`}><span className="flex items-center justify-between text-xs font-bold">{option.name}<span className="text-coral">₹{Math.round(event.price * option.priceMultiplier).toLocaleString('en-IN')}</span></span><span className="mt-1 block text-[10px] leading-4 text-ink/50 dark:text-cream/50">{option.description}</span></button>)}</div></div>{errors.form && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-500">{errors.form}</p>}<div className="mt-7 flex items-center justify-between border-t border-ink/10 pt-5 dark:border-cream/10"><div><p className="text-[10px] uppercase tracking-[.15em] text-ink/45 dark:text-cream/45">Amount to pay</p><p className="font-display text-2xl font-bold">₹{total.toLocaleString('en-IN')}</p></div><button disabled={busy || !validAttendees || Number(form.attendees) > remaining} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream transition hover:-translate-y-0.5 hover:bg-coral disabled:opacity-50 dark:bg-citrus dark:text-ink">{busy ? 'Sending…' : total === 0 ? 'Submit free request' : 'Submit payment request'}</button></div></form></>}</div></Modal>;
}

function PaymentInstructions({ amount }) { const copy = () => { navigator.clipboard?.writeText(UPI_ID); toast.success('UPI ID copied.'); }; return <div className="flex flex-col gap-4 rounded-3xl border border-coral/25 bg-coral/5 p-4 sm:flex-row sm:items-center"><div className="grid shrink-0 place-items-center rounded-2xl bg-white p-2 dark:bg-cream"><QRCodeSVG value={`upi://pay?pa=${UPI_ID}&pn=Ayush%20Guru&am=${amount}&cu=INR`} size={128} /></div><div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-coral"><AlertCircle size={14} /> First, complete UPI payment</p><p className="mt-2 text-sm font-bold">Scan to pay ₹{amount.toLocaleString('en-IN')}</p><p className="mt-1 text-xs leading-5 text-ink/55 dark:text-cream/55">Pay to Ayush Guru, then enter the UTR below. Your request goes to the organizer for approval.</p><button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-[10px] font-bold text-cream dark:bg-citrus dark:text-ink">{UPI_ID} <Copy size={12} /></button></div></div>; }
function Field({ icon: Icon, label, value, onChange, placeholder, type = 'text', error }) { return <label className="text-xs font-bold">{label}<div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 dark:border-cream/10 dark:bg-cream/[.05]"><Icon size={16} className="text-coral" /><input required type={type} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 8 : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" placeholder={placeholder} /></div>{error && <span className="mt-1 block text-[11px] font-normal text-red-500">{error}</span>}</label>; }
function PendingConfirmation({ confirmation, onClose }) { return <div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-citrus text-ink"><Check size={30} /></div><p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-coral">Request received</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">{confirmation.total === 0 ? 'We’ll review your request.' : 'We’ll check your payment.'}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink/60 dark:text-cream/60">Your request for <strong className="text-ink dark:text-cream">{confirmation.eventTitle}</strong> is pending approval. We’ll email you after the organizer reviews it.</p><div className="mx-auto mt-7 max-w-sm rounded-3xl border border-ink/10 bg-white/70 p-5 text-left dark:border-cream/10 dark:bg-cream/[.06]"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-coral">Reference</p><p className="mt-1 font-display text-xl font-semibold">{confirmation.id}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/10 pt-4 text-xs dark:border-cream/10"><span>Status<br /><strong className="text-[#d88900]">Pending review</strong></span><span>{confirmation.total === 0 ? 'Payment' : 'UTR'}<br /><strong>{confirmation.total === 0 ? 'Free event' : confirmation.transactionId}</strong></span></div></div><button type="button" onClick={onClose} className="mt-6 rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream dark:bg-citrus dark:text-ink">Done</button></div>; }
