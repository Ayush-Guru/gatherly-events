export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  if (!process.env.RESEND_API_KEY || !process.env.ORGANIZER_EMAIL) return response.status(503).json({ error: 'Organizer email is not configured.' });
  try {
    const { name, email, phone, eventTitle, reference, total, attendees, ticket, transactionId } = request.body;
    const emailResponse = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [process.env.ORGANIZER_EMAIL], reply_to: email, subject: `Payment review needed: ${eventTitle}`, html: `<h2>New Gatherly payment request</h2><p><strong>${name}</strong> requested <strong>${attendees} seat(s)</strong> for <strong>${eventTitle}</strong>.</p><p>Amount: ₹${total}<br>Ticket: ${ticket}<br>UTR: <strong>${transactionId}</strong><br>Reference: ${reference}<br>Phone: ${phone}<br>Participant email: ${email}</p><p>Open your Gatherly Organizer Studio to accept or reject this request.</p>` }) });
    const data = await emailResponse.json();
    if (!emailResponse.ok) return response.status(emailResponse.status).json(data);
    return response.status(200).json({ ok: true, id: data.id });
  } catch (error) { return response.status(500).json({ error: error.message }); }
}
