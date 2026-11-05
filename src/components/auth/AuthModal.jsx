import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, Mail, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { useAuth } from '../../context/AuthContext';

export default function AuthModal({ open, onClose }) {
  const { signIn, signUp, resetPassword, configured } = useAuth();
  const contentRef = useRef(null);
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setMode('signin'); setError(''); setMessage(''); } }, [open]);
  useEffect(() => {
    // Switching forms on a short screen should start at the heading, not at
    // the previous form's scroll position.
    if (open) contentRef.current?.closest('[role=dialog]')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [open, mode]);
  const changeMode = (next) => { setMode(next); setError(''); setMessage(''); };
  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      const result = mode === 'forgot' ? await resetPassword(form.email.trim()) : mode === 'signin' ? await signIn(form.email.trim(), form.password) : await signUp(form.email.trim(), form.password, form.name.trim());
      if (result.error) { setError(result.error.message); return; }
      if (mode === 'forgot') { setMessage('If an account exists for this email, a reset link will arrive shortly. Check your spam folder too.'); return; }
      toast.success(mode === 'signin' ? 'Welcome back.' : 'Account created. Check your email to confirm it.'); onClose();
    } catch { setError('Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} size="max-w-md" title="Account"><div ref={contentRef} className="p-6 sm:p-9"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-coral">Your Gatherly account</p><h2 className="mt-2 pr-8 font-display text-3xl font-semibold tracking-[-.06em]">{mode === 'signin' ? 'Welcome back.' : mode === 'signup' ? 'Join the room.' : 'Reset your password.'}</h2><p className="mt-3 text-sm leading-6 text-ink/55 dark:text-cream/55">{!configured ? 'Auth is ready for Supabase. Add your environment keys to turn it on.' : mode === 'forgot' ? 'Enter your email and we’ll send you a reset link.' : 'Sign in to sync your registrations across devices.'}</p>{!configured ? <div className="mt-6 rounded-2xl bg-citrus/40 p-4 text-xs leading-5 text-ink">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then restart Vite.</div> : <form onSubmit={submit} className="mt-6 space-y-4">{mode === 'signup' && <label className="block text-xs font-bold">Full name<div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 dark:border-cream/10 dark:bg-cream/[.05]"><UserRound size={16} className="text-coral" /><input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Your name" /></div></label>}<label className="block text-xs font-bold">Email address<div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 dark:border-cream/10 dark:bg-cream/[.05]"><Mail size={16} className="text-coral" /><input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="you@email.com" /></div></label>{mode !== 'forgot' && <label className="block text-xs font-bold">Password<div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 dark:border-cream/10 dark:bg-cream/[.05]"><LockKeyhole size={16} className="text-coral" /><input required minLength="6" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="At least 6 characters" /></div></label>}{mode === 'signin' && <button type="button" onClick={() => changeMode('forgot')} className="block text-xs font-bold text-coral hover:underline">Forgot password?</button>}{error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">{error}</p>}{message && <p role="status" className="rounded-xl bg-citrus/40 p-3 text-xs text-ink">{message}</p>}<button disabled={busy} className="w-full rounded-full bg-ink px-5 py-3.5 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button></form>}<button type="button" onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')} className="mt-6 w-full text-center text-xs font-bold text-coral hover:underline">{mode === 'signin' ? 'New to Gatherly? Create an account' : 'Back to sign in'}</button></div></Modal>;
}
