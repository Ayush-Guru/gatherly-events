import { createClient } from '@supabase/supabase-js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export async function sendHostRequest(request, response, kind = 'request') {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const token = /^Bearer\s+(.+)$/i.exec(request.headers?.authorization || '')?.[1];
  if (!token) return response.status(401).json({ error: 'Authentication required.' });
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM, ORGANIZER_EMAIL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !EMAIL_FROM || (kind === 'request' && !ORGANIZER_EMAIL)) return response.status(503).json({ error: 'Email service is not configured.' });
  const reference = request.body?.reference;
  if (typeof reference !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)) return response.status(400).json({ error: 'Invalid request reference.' });
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return response.status(401).json({ error: 'Invalid session.' });
    if (kind === 'status') {
      const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
      if (profileError || !['organizer', 'admin'].includes(profile?.role)) return response.status(403).json({ error: 'Organizer access required.' });
    }
    const { data: host, error } = await db.from('event_host_requests').select('*').eq('id', reference).maybeSingle();
    if (error) return response.status(500).json({ error: 'Could not load host request.' });
    if (!host || (kind === 'request' && host.user_id !== auth.user.id) || (kind === 'status' && host.user_id === auth.user.id)) return response.status(404).json({ error: 'Request not found.' });
    if ((kind === 'request' && host.status !== 'Pending') || (kind === 'status' && !['Approved', 'Declined'].includes(host.status))) return response.status(409).json({ error: 'Request status does not match notification.' });
    const column = kind === 'request' ? 'notify_email_sent_at' : 'status_email_sent_at';
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await db.from('event_host_requests').update({ [column]: claimedAt }).eq('id', reference).eq('status', host.status).is(column, null).select('id').maybeSingle();
    if (claimError) return response.status(500).json({ error: 'Could not queue notification.' });
    if (!claimed) return response.status(409).json({ error: 'Notification already sent or request changed.' });
    try {
      const sent = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'request' ? { from: EMAIL_FROM, to: [ORGANIZER_EMAIL], reply_to: host.contact_email, subject: `New event host request: ${host.title}`, html: `<h2>New host request</h2><p><strong>${escapeHtml(host.title)}</strong> · ${escapeHtml(host.category)}</p><p>${escapeHtml(host.event_date)} · ${escapeHtml(host.venue)}, ${escapeHtml(host.city)}</p><p>Contact: ${escapeHtml(host.contact_name)} · ${escapeHtml(host.contact_email)} · ${escapeHtml(host.contact_phone)}</p><p>${escapeHtml(host.details).replace(/\n/g, '<br>')}</p><p>Review this request in Gatherly Organizer Studio.</p>` } : { from: EMAIL_FROM, to: [host.contact_email], subject: `Host request ${host.status}: ${host.title}`, html: `<h2>Update on your host request</h2><p>Hi ${escapeHtml(host.contact_name)}, your request for <strong>${escapeHtml(host.title)}</strong> is <strong>${escapeHtml(host.status)}</strong>.</p><p>${host.status === 'Approved' ? 'Our team will contact you to confirm the event details before publication.' : 'Please contact the organizer if you have questions.'}</p>` }) });
      if (!sent.ok) throw new Error('Email provider rejected request');
      return response.status(200).json({ ok: true });
    } catch {
      await db.from('event_host_requests').update({ [column]: null }).eq('id', reference).eq(column, claimedAt);
      return response.status(502).json({ error: 'Email delivery failed.' });
    }
  } catch { return response.status(500).json({ error: 'Notification failed.' }); }
}
