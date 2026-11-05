import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function authorized(header, secret) {
  if (!secret || typeof header !== 'string') return false;
  const actual = Buffer.from(header); const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const { CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM } = process.env;
  if (!authorized(request.headers?.authorization, CRON_SECRET)) return response.status(401).json({ error: 'Unauthorized' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !EMAIL_FROM) return response.status(503).json({ error: 'Reminder service is not configured.' });
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const now = new Date(); const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const { data, error } = await db.from('registrations').select('id,name,email,events!inner(title,date,venue,city)').eq('status', 'Confirmed').is('reminder_sent_at', null).gte('events.date', now.toISOString()).lte('events.date', end.toISOString()).order('id').limit(100);
    if (error) return response.status(500).json({ error: 'Could not load reminders.' });
    let sent = 0, failed = 0;
    for (const registration of data || []) {
      const claimedAt = new Date().toISOString();
      const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: claim, error: claimError } = await db.from('registrations').update({ reminder_claimed_at: claimedAt }).eq('id', registration.id).eq('status', 'Confirmed').is('reminder_sent_at', null).or(`reminder_claimed_at.is.null,reminder_claimed_at.lt.${staleBefore}`).select('id').maybeSingle();
      if (claimError) { failed++; continue; }
      if (!claim) continue;
      try {
        const event = registration.events;
        const mail = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `reminder-${registration.id}` }, body: JSON.stringify({ from: EMAIL_FROM, to: [registration.email], subject: `Coming up: ${event.title}`, html: `<h2>Your event is coming up, ${escapeHtml(registration.name)}.</h2><p><strong>${escapeHtml(event.title)}</strong><br>${escapeHtml(event.date)}<br>${escapeHtml(event.venue)}, ${escapeHtml(event.city)}</p><p>Open My Gatherly for your ticket. Reference: ${escapeHtml(registration.id)}</p>` }) });
        if (!mail.ok) throw new Error('Email provider rejected request');
        const { error: saveError } = await db.from('registrations').update({ reminder_sent_at: new Date().toISOString(), reminder_claimed_at: null }).eq('id', registration.id).eq('reminder_claimed_at', claimedAt);
        if (saveError) throw saveError;
        sent++;
      } catch {
        await db.from('registrations').update({ reminder_claimed_at: null }).eq('id', registration.id).eq('reminder_claimed_at', claimedAt);
        failed++;
      }
    }
    return response.status(failed ? 500 : 200).json({ ok: !failed, sent, failed, batchLimit: 100 });
  } catch { return response.status(500).json({ error: 'Reminder processing failed.' }); }
}
