export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  if (!process.env.RESEND_API_KEY) return response.status(503).json({ error: 'Email is not configured.' });
  try {
    const { to, name, eventTitle, reference, status } = request.body;
    const approved = status === 'Confirmed';
    const emailResponse = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject: `${approved ? 'Confirmed' : 'Update'}: ${eventTitle}`, html: approved ? `<h2>You’re on the list, ${name}.</h2><p>Your payment has been accepted for <strong>${eventTitle}</strong>.</p><p>Reference: <strong>${reference}</strong></p><p>Your QR ticket is now active in your Gatherly dashboard.</p>` : `<h2>Update on your Gatherly request</h2><p>We couldn’t approve your payment request for <strong>${eventTitle}</strong>.</p><p>Reference: <strong>${reference}</strong></p><p>Please contact the organizer if you think this was a mistake.</p>` }) });
    const data = await emailResponse.json();
    if (!emailResponse.ok) return response.status(emailResponse.status).json(data);
    return response.status(200).json({ ok: true, id: data.id });
  } catch (error) { return response.status(500).json({ error: error.message }); }
}
