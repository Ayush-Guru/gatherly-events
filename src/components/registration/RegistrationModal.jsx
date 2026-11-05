import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Mail, Phone, ReceiptText, UserRound, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { ticketTypes } from '../../data/events';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

const initialForm = { name: '', email: '', phone: '', attendees: 1, ticket: 'general', transactionId: '' };
const UPI_ID = import.meta.env.VITE_UPI_ID || '7587704110@fam';
const ORGANIZER_EMAIL = import.meta.env.VITE_ORGANIZER_EMAIL || 'ayushguru16@gmail.com';

export default function RegistrationModal({ event, open, onClose }) {
  const { register } = useApp();
  const { configured } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setForm(initialForm); setErrors({}); setConfirmation(null); setBusy(false); } }, [open, event]);
  const ticket = ticketTypes.find((item) => item.id === form.ticket) || ticketTypes[0];
  const total = useMemo(() => Math.round((event?.price || 0) * ticket.priceMultiplier * Number(form.attendees || 1)), [event, ticket, form.attendees]);
  if (!event || !open) return null;

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })); };
  const validate = () => {
    const next = {};
    if (!form.name.trim() || !/^[a-zA-Z][a-zA-Z .'-]{2,}$/.test(form.name.trim())) next.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (!/^[+\d][\d\s-]{8,14}$/.test(form.phone)) next.phone = 'Enter a valid phone number.';
    if (Number(form.attendees) < 1 || Number(form.attendees) > 8) next.attendees = 'Choose between 1 and 8 attendees.';
    if (form.transactionId.trim().length < 6) next.transactionId = 'Enter the UTR or transaction ID after payment.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (eventObject) => {
    eventObject.preventDefault();
    if (!validate()) return;
    setBusy(true);
    const details = { ...form, name: form.name.trim(), transactionId: form.transactionId.trim(), eventId: event.id, eventTitle: event.title, total };
    const result = await register(details);
    if (result.error) { setErrors({ form: result.error }); setBusy(false); return; }
    setConfirmation(result.registration); setBusy(false); toast.success('Request sent for review.');
    if (configured) fetch('/api/send-registration-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...details, reference: result.registration.id, organizerEmail: ORGANIZER_EMAIL }) }).catch(() => {});
  };

  return <Modal open={open} onClose={onClose} size="max-w-2xl"><div className="p-6 sm:p-9">{confirmation ? <PendingConfirmation confirmation={confirmation} onClose={onClose} /> : <>
    <div className="mb-7 pr-8"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-coral">Reserve your place</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">Join {event.title}</h2><p className="mt-2 text-sm text-ink/55 dark:text-cream/55">Pay by UPI, submit your UTR, and we’ll confirm your seat after checking the payment.</p></div>
    <PaymentInstructions amount={total} />
    <form onSubmit={submit} noValidate><div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Field icon={UserRound} label="Full name" value={form.name} onChange={(value) => update('name', value)} placeholder="Aarav Sharma" error={errors.name} />
      <Field icon={Mail} label="Email address" type="email" value={form.email} onChange={(value) => update('email', value)} placeholder="you@email.com" error={errors.email} />
      <Field icon={Phone} label="Phone number" type="tel" value={form.phone} onChange={(value) => update('phone', value)} placeholder="+91 98765 43210" error={errors.phone} />
      <Field icon={Users} label="Attendees" type="number" value={form.attendees} onChange={(value) => update('attendees', value)} error={errors.attendees} />
      <div className="sm:col-span-2"><Field icon={ReceiptText} label="UPI transaction ID / UTR" value={form.transactionId} onChange={(value) => update('transactionId', value)} placeholder="Example: 123456789012" error={errors.transactionId} /></div>
    </div><div className="mt-6"><p className="mb-3 text-xs font-bold">Choose your pass</p><div className="grid gap-2 sm:grid-cols-3">{ticketTypes.map((option) => <button type="button" key={option.id} onClick={() => update('ticket', option.id)} className={`rounded-2xl border p-3 text-left transition ${form.ticket === option.id ? 'border-coral bg-coral/10' : 'border-ink/10 hover:border-coral/50 dark:border-cream/10'}`}><span className="flex items-center justify-between text-xs font-bold">{option.name}<span className="text-coral">₹{Math.round(event.price * option.priceMultiplier).toLocaleString('en-IN')}</span></span><span className="mt-1 block text-[10px] leading-4 text-ink/50 dark:text-cream/50">{option.description}</span></button>)}</div></div>{errors.form && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-500">{errors.form}</p>}<div className="mt-7 flex items-center justify-between border-t border-ink/10 pt-5 dark:border-cream/10"><div><p className="text-[10px] uppercase tracking-[.15em] text-ink/45 dark:text-cream/45">Amount to pay</p><p className="font-display text-2xl font-bold">₹{total.toLocaleString('en-IN')}</p></div><button disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream transition hover:-translate-y-0.5 hover:bg-coral disabled:opacity-50 dark:bg-citrus dark:text-ink">{busy ? 'Sending…' : 'Submit payment request'}</button></div></form></>}</div></Modal>;
}

function PaymentInstructions({ amount }) { const copy = () => { navigator.clipboard?.writeText(UPI_ID); toast.success('UPI ID copied.'); }; return <div className="flex flex-col gap-4 rounded-3xl border border-coral/25 bg-coral/5 p-4 sm:flex-row sm:items-center"><div className="grid shrink-0 place-items-center rounded-2xl bg-white p-2 dark:bg-cream"><QRCodeSVG value={`upi://pay?pa=${UPI_ID}&pn=Ayush%20Guru&am=${amount}&cu=INR`} size={128} /></div><div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-coral"><AlertCircle size={14} /> First, complete UPI payment</p><p className="mt-2 text-sm font-bold">Scan to pay ₹{amount.toLocaleString('en-IN')}</p><p className="mt-1 text-xs leading-5 text-ink/55 dark:text-cream/55">Pay to Ayush Guru, then enter the UTR below. Your request goes to the organizer for approval.</p><button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-[10px] font-bold text-cream dark:bg-citrus dark:text-ink">{UPI_ID} <Copy size={12} /></button></div></div>; }
function Field({ icon: Icon, label, value, onChange, placeholder, type = 'text', error }) { return <label className="text-xs font-bold">{label}<div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 dark:border-cream/10 dark:bg-cream/[.05]"><Icon size={16} className="text-coral" /><input required type={type} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 8 : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" placeholder={placeholder} /></div>{error && <span className="mt-1 block text-[11px] font-normal text-red-500">{error}</span>}</label>; }
function PendingConfirmation({ confirmation, onClose }) { return <div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-citrus text-ink"><Check size={30} /></div><p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-coral">Request received</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">We’ll check your payment.</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink/60 dark:text-cream/60">Your request for <strong className="text-ink dark:text-cream">{confirmation.eventTitle}</strong> is pending approval. We’ll email you after the organizer reviews it.</p><div className="mx-auto mt-7 max-w-sm rounded-3xl border border-ink/10 bg-white/70 p-5 text-left dark:border-cream/10 dark:bg-cream/[.06]"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-coral">Reference</p><p className="mt-1 font-display text-xl font-semibold">{confirmation.id}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/10 pt-4 text-xs dark:border-cream/10"><span>Status<br /><strong className="text-[#d88900]">Pending review</strong></span><span>UTR<br /><strong>{confirmation.transactionId}</strong></span></div></div><button type="button" onClick={onClose} className="mt-6 rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream dark:bg-citrus dark:text-ink">Done</button></div>; }
