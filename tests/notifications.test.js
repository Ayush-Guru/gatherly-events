import test from 'node:test';
import assert from 'node:assert/strict';
import requestHandler from '../api/send-registration-request.js';
import statusHandler from '../api/send-registration-status-email.js';
import receiptHandler from '../api/send-registration-receipt.js';

function response() { return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', RESEND_API_KEY: 'resend-key', EMAIL_FROM: 'Gatherly <test@example.com>', ORGANIZER_EMAIL: 'organizer@example.com' };
const registration = { id: 'GTH-test', user_id: 'owner', name: '<b>Alice</b>', email: 'alice@example.com', phone: '1234567890', attendees: 1, ticket: 'general', total: 100, transaction_id: '123456', status: 'Pending', events: { title: 'Test event' } };
function mockFetch({ user = 'owner', role = 'attendee', record = registration, claim = true } = {}) {
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input); calls.push({ url, options });
    let body;
    if (url.includes('/auth/v1/user')) body = { id: user };
    else if (url.includes('/rest/v1/profiles')) body = [{ role }];
    else if (url.includes('/rest/v1/registrations') && options.method === 'PATCH') body = claim ? { id: record.id } : null;
    else if (url.includes('/rest/v1/registrations')) body = record ? [record] : [];
    else if (url.includes('api.resend.com')) body = { id: 'mail-1' };
    else throw new Error(`Unexpected URL ${url}`);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const req = (reference = 'GTH-test') => ({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: { reference, to: 'attacker@example.com', status: 'Confirmed' } });

test('notification endpoints require authentication and POST', async () => {
  let res = response(); await requestHandler({ method: 'POST', headers: {}, body: {} }, res); assert.equal(res.code, 401);
  res = response(); await statusHandler({ method: 'GET' }, res); assert.equal(res.code, 405);
});
test('registration email uses verified database data and escapes HTML', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch; const calls = mockFetch();
  try { const res = response(); await requestHandler(req(), res); assert.equal(res.code, 200); const email = JSON.parse(calls.find((c) => c.url.includes('api.resend.com')).options.body); assert.deepEqual(email.to, ['organizer@example.com']); assert.match(email.html, /&lt;b&gt;Alice&lt;\/b&gt;/); }
  finally { globalThis.fetch = original; }
});
test('another user cannot send request notification', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch; const calls = mockFetch({ user: 'other' });
  try { const res = response(); await requestHandler(req(), res); assert.equal(res.code, 404); assert.equal(calls.some((c) => c.url.includes('api.resend.com')), false); }
  finally { globalThis.fetch = original; }
});
test('only organizers can send status notifications, based on stored status and recipient', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch;
  try {
    mockFetch(); let res = response(); await statusHandler(req(), res); assert.equal(res.code, 403);
    const calls = mockFetch({ user: 'organizer', role: 'organizer', record: { ...registration, status: 'Confirmed' } });
    res = response(); await statusHandler(req(), res); assert.equal(res.code, 200); const email = JSON.parse(calls.find((c) => c.url.includes('api.resend.com')).options.body); assert.deepEqual(email.to, ['alice@example.com']); assert.match(email.subject, /^Confirmed/);
  } finally { globalThis.fetch = original; }
});
test('already claimed notifications are not sent again', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch; const calls = mockFetch({ claim: false });
  try { const res = response(); await requestHandler(req(), res); assert.equal(res.code, 409); assert.equal(calls.some((c) => c.url.includes('api.resend.com')), false); }
  finally { globalThis.fetch = original; }
});
test('organizers cannot email their own registration or announce a pending review', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch;
  try {
    let calls = mockFetch({ user: 'owner', role: 'organizer', record: { ...registration, status: 'Confirmed' } });
    let res = response(); await statusHandler(req(), res); assert.equal(res.code, 404); assert.equal(calls.some((c) => c.url.includes('api.resend.com')), false);
    calls = mockFetch({ user: 'organizer', role: 'organizer' });
    res = response(); await statusHandler(req(), res); assert.equal(res.code, 409); assert.equal(calls.some((c) => c.url.includes('api.resend.com')), false);
  } finally { globalThis.fetch = original; }
});

test('receipt is sent only to the owner and uses the stored email', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch;
  try {
    let calls = mockFetch({ user: 'other' }); let res = response(); await receiptHandler(req(), res); assert.equal(res.code, 404); assert.equal(calls.some((c) => c.url.includes('api.resend.com')), false);
    calls = mockFetch(); res = response(); await receiptHandler(req(), res); assert.equal(res.code, 200);
    const email = JSON.parse(calls.find((c) => c.url.includes('api.resend.com')).options.body); assert.deepEqual(email.to, ['alice@example.com']); assert.match(email.subject, /Request received/);
  } finally { globalThis.fetch = original; }
});

test('unpaid holds do not send payment-review or receipt notifications', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch;
  try {
    const calls = mockFetch({ record: { ...registration, transaction_id: 'AWAITING-UPI' } });
    for (const handler of [requestHandler, receiptHandler]) {
      const res = response(); await handler(req(), res); assert.equal(res.code, 409);
    }
    assert.equal(calls.some((c) => c.url.includes('api.resend.com')), false);
  } finally { globalThis.fetch = original; }
});
