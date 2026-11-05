import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/send-event-reminders.js';
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('reminder cron rejects requests without the server secret', async () => {
  const old = process.env.CRON_SECRET; process.env.CRON_SECRET = 'server-secret';
  try { const res = response(); await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, res); assert.equal(res.code, 401); }
  finally { if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old; }
});
test('reminder cron sends only the stored recipient and claims before sending', async () => {
  Object.assign(process.env, { CRON_SECRET: 'server-secret', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', RESEND_API_KEY: 'resend-key', EMAIL_FROM: 'Gatherly <test@example.com>' });
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options = {}) => { calls.push({ url: String(url), options }); let data;
    if (String(url).includes('/rest/v1/registrations') && options.method === 'PATCH') data = { id: 'GTH-test' };
    else if (String(url).includes('/rest/v1/registrations')) data = [{ id: 'GTH-test', name: '<Alice>', email: 'alice@example.com', events: { title: 'Event', date: '2027-02-01', venue: 'Hall', city: 'Pune' } }];
    else data = { id: 'mail' };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try { const res = response(); await handler({ method: 'GET', headers: { authorization: 'Bearer server-secret' } }, res); assert.equal(res.code, 200); assert.equal(res.body.sent, 1); const mail = JSON.parse(calls.find((call) => call.url.includes('resend.com')).options.body); assert.deepEqual(mail.to, ['alice@example.com']); assert.match(mail.html, /&lt;Alice&gt;/); assert.ok(calls.findIndex((c) => c.options.method === 'PATCH') < calls.findIndex((c) => c.url.includes('resend.com'))); }
  finally { globalThis.fetch = original; }
});
