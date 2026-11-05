import { useState } from 'react';
import { LockKeyhole, Mail, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { useAuth } from '../../context/AuthContext';

export default function AuthModal({ open, onClose }) {
  const { signIn, signUp, configured } = useAuth();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    const result = mode === 'signin' ? await signIn(form.email, form.password) : await signUp(form.email, form.password, form.name);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    toast.success(mode === 'signin' ? 'Welcome back.' : 'Account created. Check your email to confirm it.');
    onClose();
  };
  return <Modal open={open} onClose={onClose} size="max-w-md"><div className="p-7 sm:p-9"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-coral">Your Gatherly account</p><h2 className="mt-2 font-display text-3xl font-semibold tracking-[-.06em]">{mode === 'signin' ? 'Welcome back.' : 'Join the room.'}</h2><p className="mt-3 text-sm leading-6 text-ink/55 dark:text-cream/55">{configured ? 'Sign in to sync your registrations across devices.' : 'Auth is ready for Supabase. Add your environment keys to turn it on.'}</p>{!configured ? <div className="mt-6 rounded-2xl bg-citrus/40 p-4 text-xs leading-5 text-ink">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then restart Vite.</div> : <form onSubmit={submit} className="mt-6 space-y-4">{mode === 'signup' && <label className="text-xs font-bold">Full name<div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 dark:border-cream/10 dark:bg-cream/[.05]"><UserRound size={16} className="text-coral" /><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Your name" /></div></label>}<label className="text-xs font-bold">Email address<div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 dark:border-cream/10 dark:bg-cream/[.05]"><Mail size={16} className="text-coral" /><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="you@email.com" /></div></label><label className="text-xs font-bold">Password<div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 dark:border-cream/10 dark:bg-cream/[.05]"><LockKeyhole size={16} className="text-coral" /><input required minLength="6" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="At least 6 characters" /></div></label>{error && <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">{error}</p>}<button disabled={busy} className="w-full rounded-full bg-ink px-5 py-3.5 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button></form>}<button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} className="mt-6 w-full text-center text-xs font-bold text-coral hover:underline">{mode === 'signin' ? 'New to Gatherly? Create an account' : 'Already have an account? Sign in'}</button></div></Modal>;
}
