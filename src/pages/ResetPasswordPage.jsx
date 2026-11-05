import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordPage() {
  const { recovery, session, loading, updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await updatePassword(password);
      if (result.error) { setError(result.error.message); return; }
      setDone(true); await signOut();
    } catch { setError('Could not update your password. Please try again.'); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto min-h-[70vh] w-[min(480px,calc(100%-32px))] py-16"><div className="rounded-3xl border border-ink/10 bg-white/60 p-6 shadow-soft dark:border-cream/10 dark:bg-cream/[.05] sm:p-9"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-coral">Account recovery</p><h1 className="mt-3 font-display text-3xl font-semibold">Set a new password.</h1>{loading ? <p className="mt-4 text-sm">Checking your reset link…</p> : done ? <p role="status" className="mt-4 text-sm">Your password has been updated. You can now sign in with your new password.</p> : !recovery || !session ? <p className="mt-4 text-sm">This reset link is invalid or expired. Open Sign in and request a new link using “Forgot password?”.</p> : <form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-xs font-bold">New password<input type="password" autoComplete="new-password" required minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-ink/10 bg-transparent px-3 py-3 text-sm dark:border-cream/10" /></label><label className="block text-xs font-bold">Confirm new password<input type="password" autoComplete="new-password" required minLength="6" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 w-full rounded-xl border border-ink/10 bg-transparent px-3 py-3 text-sm dark:border-cream/10" /></label>{error && <p role="alert" className="text-xs text-red-500">{error}</p>}<button disabled={busy} className="w-full rounded-full bg-ink px-5 py-3 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">{busy ? 'Saving…' : 'Update password'}</button></form>}<Link to="/" className="mt-6 inline-block text-xs font-bold text-coral">Back to home</Link></div></main>;
}
