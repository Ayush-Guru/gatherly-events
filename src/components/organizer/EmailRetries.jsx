import { useState } from 'react';
import toast from 'react-hot-toast';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { sendNotification } from '../../lib/notifications';

export default function EmailRetries() {
  const { registrations, markNotificationSent } = useApp();
  const { session, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const unsent = registrations.filter((item) => ['Confirmed', 'Rejected'].includes(item.status) && !item.status_email_sent_at && item.user_id !== user.id);
  const retry = async (item) => { setBusy(true); try { await sendNotification('send-registration-status-email', item.id, session.access_token); markNotificationSent(item.id, 'status_email_sent_at'); toast.success('Attendee email sent.'); } catch { toast.error('Could not send email. Check configuration and try again.'); } finally { setBusy(false); } };
  if (!unsent.length) return null;
  return <section className="mt-12"><h2 className="font-display text-2xl font-semibold">Emails needing attention</h2><p className="mt-2 text-xs text-ink/55 dark:text-cream/55">The review is saved even if email delivery fails.</p><div className="mt-4 space-y-2">{unsent.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 p-4 text-xs dark:border-cream/10"><span>{item.eventTitle} · {item.email} · {item.status}</span><button type="button" disabled={busy} onClick={() => retry(item)} className="rounded-full border border-ink/20 px-4 py-2 font-bold disabled:opacity-50 dark:border-cream/20">Retry attendee email</button></div>)}</div></section>;
}
