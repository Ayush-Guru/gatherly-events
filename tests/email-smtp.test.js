import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { emailConfig, sendEmail } from '../server/email.js';
import hostHandler from '../api/send-host-status-email.js';
import registrationHandler from '../api/send-registration-request.js';

const env = { EMAIL_PROVIDER: 'gmail', GMAIL_SMTP_USER: 'sender@gmail.com', GMAIL_SMTP_APP_PASSWORD: 'abcd efgh', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', ORGANIZER_EMAIL: 'organizer@example.com' };
const reference = '01999999-1111-4111-8111-111111111111';
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const request = () => ({ method: 'POST', headers: { authorization: 'Bearer token' }, body: { reference, to: 'attacker@example.com' } });

test('Gmail is explicit and never silently falls back to Resend', () => {
  assert.equal(emailConfig({ EMAIL_PROVIDER: 'gmail', RESEND_API_KEY: 'key', EMAIL_FROM: 'sender@example.com' }), null);
  assert.equal(emailConfig({ EMAIL_PROVIDER: 'unknown', RESEND_API_KEY: 'key', EMAIL_FROM: 'sender@example.com' }), null);
  assert.equal(emailConfig({ RESEND_API_KEY: 'key', EMAIL_FROM: 'sender@example.com' }).provider, 'resend');
  assert.deepEqual(emailConfig(env), { provider: 'gmail', user: 'sender@gmail.com', pass: 'abcdefgh' });
});

test('Gmail uses TLS, the authenticated sender, safe error categories and closes transport', async () => {
  let options, message, closed = false;
  const createTransport = (value) => { options = value; return { sendMail: async (mail) => { message = mail; return { accepted: ['host@example.com'] }; }, close: () => { closed = true; } }; };
  await sendEmail(emailConfig(env), { from: 'attacker@example.com', to: ['host@example.com'], reply_to: 'reply@example.com', subject: 'Update', html: '<p>Hello</p>' }, { createTransport });
  assert.equal(options.host, 'smtp.gmail.com'); assert.equal(options.port, 465); assert.equal(options.secure, true);
  assert.deepEqual(message.from, { name: 'Gatherly', address: 'sender@gmail.com' }); assert.equal(message.replyTo, 'reply@example.com'); assert.equal(closed, true);
  for (const [raw, code] of [[{ code: 'EAUTH', message: 'secret' }, 'EMAIL_SMTP_AUTH'], [{ code: 'EENVELOPE', message: 'secret' }, 'EMAIL_SMTP_RECIPIENT'], [{ code: 'ETIMEDOUT', message: 'secret' }, 'EMAIL_DELIVERY_UNKNOWN']]) {
    closed = false;
    await assert.rejects(sendEmail(emailConfig(env), { to: ['host@example.com'] }, { createTransport: () => ({ sendMail: async () => { throw raw; }, close: () => { closed = true; } }) }), (error) => error.safeCode === code && !error.message.includes('secret'));
    assert.equal(closed, true);
  }
});

test('host and registration handlers use Gmail and the stored recipient', async () => {
  const originalFetch = globalThis.fetch, originalTransport = nodemailer.createTransport;
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]])); Object.assign(process.env, env);
  let sent = [], calls = [];
  nodemailer.createTransport = () => ({ sendMail: async (mail) => { sent.push(mail); return { accepted: mail.to }; }, close: () => {} });
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input); calls.push({ url, options }); let body;
    if (url.includes('/auth/v1/user')) body = { id: 'organizer' };
    else if (url.includes('/profiles')) body = [{ role: 'organizer' }];
    else if (url.includes('/event_host_requests') && options.method === 'PATCH') body = { id: reference };
    else if (url.includes('/event_host_requests')) body = [{ id: reference, user_id: 'host', status: 'Approved', title: 'Host event', contact_name: 'Host', contact_email: 'host@example.com' }];
    else if (url.includes('/registrations') && options.method === 'PATCH') body = { id: reference };
    else if (url.includes('/registrations')) body = [{ id: reference, user_id: 'organizer', status: 'Pending', name: 'Alice', email: 'alice@example.com', attendees: 1, total: 0, transaction_id: 'FREE', events: { title: 'Event' } }];
    else throw new Error('Unexpected request');
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    let res = response(); await hostHandler(request(), res); assert.equal(res.code, 200); assert.deepEqual(sent[0].to, ['host@example.com']);
    res = response(); await registrationHandler(request(), res); assert.equal(res.code, 200); assert.deepEqual(sent[1].to, ['organizer@example.com']); assert.equal(sent[1].replyTo, 'alice@example.com');
    assert.equal(calls.some((call) => call.url.includes('resend.com')), false);
    sent = []; calls = [];
    nodemailer.createTransport = () => ({ sendMail: async () => { throw Object.assign(new Error('secret'), { code: 'EAUTH' }); }, close: () => {} });
    res = response(); await hostHandler(request(), res);
    assert.equal(res.code, 502); assert.equal(res.body.code, 'EMAIL_SMTP_AUTH'); assert.doesNotMatch(JSON.stringify(res.body), /secret/);
    const patches = calls.filter((call) => call.options.method === 'PATCH');
    assert.equal(patches.length, 2); assert.equal(JSON.parse(patches[1].options.body).status_email_sent_at, null);
    assert.equal(calls.some((call) => call.url.includes('resend.com')), false);
  } finally {
    nodemailer.createTransport = originalTransport; globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
