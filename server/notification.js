import { emailConfig, sendEmail } from './email.js';
import { createClient } from '@supabase/supabase-js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export async function sendRegistrationEmail(request, response, kind) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const token = /^Bearer\s+(.+)$/i.exec(request.headers?.authorization || '')?.[1];
  if (!token) return response.status(401).json({ error: 'Authentication required.' });
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORGANIZER_EMAIL } = process.env;
  const mailConfig = emailConfig();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !mailConfig || (kind === 'request' && !ORGANIZER_EMAIL)) return response.status(503).json({ error: 'Email service is not configured.' });
  const reference = request.body?.reference;
  if (typeof reference !== 'string' || reference.length > 100 || !reference.trim()) return response.status(400).json({ error: 'Registration reference required.' });
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return response.status(401).json({ error: 'Invalid session.' });
    if (kind === 'status') {
      const { data: profile, error } = await db.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
      if (error || !['organizer', 'admin'].includes(profile?.role)) return response.status(403).json({ error: 'Organizer access required.' });
    }
    const { data: registration, error } = await db.from('registrations').select('*, events(title)').eq('id', reference).maybeSingle();
    if (error) return response.status(500).json({ error: 'Could not load registration.' });
    if (!registration || (['request', 'receipt'].includes(kind) && registration.user_id !== auth.user.id) || (kind === 'status' && registration.user_id === auth.user.id)) return response.status(404).json({ error: 'Registration not found.' });
    if (['request', 'receipt'].includes(kind) && registration.status !== 'Pending' || kind === 'status' && !['Confirmed', 'Rejected'].includes(registration.status)) return response.status(409).json({ error: 'Registration status does not match notification.' });
    if (registration.transaction_id === 'AWAITING-UPI') return response.status(409).json({ error: 'Payment reference has not been submitted.' });
    const column = kind === 'request' ? 'request_email_sent_at' : kind === 'receipt' ? 'receipt_email_sent_at' : 'status_email_sent_at';
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await db.from('registrations').update({ [column]: claimedAt }).eq('id', reference).eq('status', registration.status).is(column, null).select('id').maybeSingle();
    if (claimError) return response.status(500).json({ error: 'Could not queue notification.' });
    if (!claimed) return response.status(409).json({ error: 'Notification already sent or registration changed.' });
    const name = escapeHtml(registration.name), title = escapeHtml(registration.events?.title || 'Gatherly event'), ref = escapeHtml(registration.id);
    const approved = registration.status === 'Confirmed';
    const payload = kind === 'request' ? {
      to: [ORGANIZER_EMAIL], reply_to: registration.email, subject: `Payment review needed: ${registration.events?.title || 'Gatherly event'}`,
      html: `<h2>New Gatherly payment request</h2><p><strong>${name}</strong> requested <strong>${registration.attendees} seat(s)</strong> for <strong>${title}</strong>.</p><p>Amount: ₹${registration.total}<br>Ticket: ${escapeHtml(registration.ticket)}<br>UTR: <strong>${escapeHtml(registration.transaction_id)}</strong><br>Reference: ${ref}<br>Phone: ${escapeHtml(registration.phone)}<br>Participant email: ${escapeHtml(registration.email)}</p><p>Open Organizer Studio to review.</p>`,
    } : kind === 'receipt' ? {
      to: [registration.email], subject: `Request received: ${registration.events?.title || 'Gatherly event'}`,
      html: `<h2>Request received, ${name}.</h2><p>Your registration for <strong>${title}</strong> is pending organizer review. Reference: <strong>${ref}</strong>.</p><p>Check My Gatherly for updates. Payments and refunds are reviewed manually.</p>`,
    } : {
      to: [registration.email], subject: `${approved ? 'Confirmed' : 'Update'}: ${registration.events?.title || 'Gatherly event'}`,
      html: approved ? `<h2>You’re on the list, ${name}.</h2><p>${registration.total === 0 ? 'Your free booking has been accepted for' : 'Your payment has been accepted for'} <strong>${title}</strong>.</p><p>Reference: <strong>${ref}</strong></p><p>Your QR ticket is now active in your Gatherly dashboard.</p>` : `<h2>Update on your Gatherly request</h2><p>We couldn’t approve your ${registration.total === 0 ? 'booking' : 'payment'} request for <strong>${title}</strong>.</p><p>Reference: <strong>${ref}</strong></p><p>Please contact the organizer if you think this was a mistake.</p>`,
    };
    try {
      await sendEmail(mailConfig, payload);
      return response.status(200).json({ ok: true });
    } catch {
      await db.from('registrations').update({ [column]: null }).eq('id', reference).eq(column, claimedAt);
      return response.status(502).json({ error: 'Email delivery failed.' });
    }
  } catch { return response.status(500).json({ error: 'Notification failed.' }); }
}
