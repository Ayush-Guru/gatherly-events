import nodemailer from 'nodemailer';

// Select explicitly: incomplete Gmail settings must never fall back to another provider.
export function emailConfig(env = process.env) {
  const provider = (env.EMAIL_PROVIDER || 'resend').toLowerCase().trim();
  if (provider === 'gmail') {
    const user = (env.GMAIL_SMTP_USER || '').trim();
    const pass = (env.GMAIL_SMTP_APP_PASSWORD || '').replace(/\s/g, '');
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(user) && pass ? { provider, user, pass } : null;
  }
  if (provider === 'resend' && env.RESEND_API_KEY && env.EMAIL_FROM) return { provider, apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM };
  return null;
}

// Only fixed categories are propagated; never expose SMTP/provider error messages.
export async function sendEmail(config, payload, { fetchImpl = fetch, createTransport = nodemailer.createTransport } = {}) {
  if (config.provider === 'gmail') {
    const transport = createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: config.user, pass: config.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
    try {
      const result = await transport.sendMail({ from: { name: 'Gatherly', address: config.user }, to: payload.to, replyTo: payload.reply_to, subject: payload.subject, html: payload.html });
      if (!result.accepted?.length) throw Object.assign(new Error('No recipient accepted'), { code: 'EENVELOPE' });
      return;
    } catch (error) {
      const code = error?.code === 'EAUTH' ? 'EMAIL_SMTP_AUTH' : error?.code === 'EENVELOPE' ? 'EMAIL_SMTP_RECIPIENT' : 'EMAIL_DELIVERY_UNKNOWN';
      throw Object.assign(new Error('Email delivery failed'), { safeCode: code });
    } finally { transport.close(); }
  }
  let response;
  try {
    response = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, from: config.from }) });
  } catch { throw Object.assign(new Error('Email delivery failed'), { safeCode: 'EMAIL_DELIVERY_UNKNOWN' }); }
  if (response.ok) return;
  const status = response.status;
  const code = status === 401 ? 'EMAIL_PROVIDER_AUTH' : status === 403 ? 'EMAIL_PROVIDER_FORBIDDEN' : [400, 422].includes(status) ? 'EMAIL_PROVIDER_INVALID' : status === 429 ? 'EMAIL_PROVIDER_RATE_LIMIT' : 'EMAIL_PROVIDER_UNAVAILABLE';
  throw Object.assign(new Error('Email delivery failed'), { safeCode: code });
}
