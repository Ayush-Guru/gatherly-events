import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/send-host-request.js';
import statusHandler from '../api/send-host-status-email.js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', RESEND_API_KEY: 'resend-key', EMAIL_FROM: 'Gatherly <test@example.com>', ORGANIZER_EMAIL: 'organizer@example.com' };
const host = { id: '01999999-1111-4111-8111-111111111111', user_id: 'owner', status: 'Pending', title: '<b>Art</b>', category: 'Culture', event_date: '2027-12-31T10:00:00Z', venue: 'Town Hall', city: 'Pune', contact_name: 'A User', contact_email: 'user@example.com', contact_phone: '1234567890', details: '<script>bad</script>' };
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const req = () => ({ method: 'POST', headers: { authorization: 'Bearer user-token' }, body: { reference: host.id, to: 'attacker@example.com' } });
function mockFetch({ user = 'owner', role = 'attendee', record = host, claim = true, failMail = false, providerStatus = 200, mailThrows = false, releaseFails = false } = {}) {
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input); calls.push({ url, options });
    let body;
    if (url.includes('/auth/v1/user')) body = { id: user };
    else if (url.includes('/rest/v1/profiles')) body = [{ role }];
    else if (url.includes('/rest/v1/event_host_requests') && options.method === 'PATCH') { if (releaseFails && JSON.parse(options.body).status_email_sent_at === null) return new Response(JSON.stringify({ message: 'test error' }), { status: 500, headers: { 'Content-Type': 'application/json' } }); body = claim ? { id: host.id } : null; }
    else if (url.includes('/rest/v1/event_host_requests')) body = record ? [record] : [];
    else if (url.includes('api.resend.com')) { if (mailThrows) throw new Error('PRIVATE provider message'); return new Response('{"message":"PRIVATE provider message"}', { status: failMail ? 500 : providerStatus, headers: { 'Content-Type': 'application/json' } }); }
    else throw new Error(`Unexpected URL ${url}`);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
test('host notification requires authentication', async () => { const res = response(); await handler({ method: 'POST', headers: {} }, res); assert.equal(res.code, 401); });
test('host notification uses verified stored data, escapes HTML and sends to organizer', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch; const calls = mockFetch();
  try { const res = response(); await handler(req(), res); assert.equal(res.code, 200); const mail = JSON.parse(calls.find((c) => c.url.includes('api.resend.com')).options.body); assert.deepEqual(mail.to, ['organizer@example.com']); assert.match(mail.html, /&lt;script&gt;bad&lt;\/script&gt;/); }
  finally { globalThis.fetch = original; }
});
test('host notification rejects non-owner, reviewed and already-notified requests', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch;
  try { for (const [options, code] of [[{ user: 'other' }, 404], [{ record: { ...host, status: 'Approved' } }, 409], [{ claim: false }, 409]]) { const calls = mockFetch(options); const res = response(); await handler(req(), res); assert.equal(res.code, code); assert.equal(calls.some((c) => c.url.includes('api.resend.com')), false); } }
  finally { globalThis.fetch = original; }
});
test('a failed host email releases its claim for retry', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch; const calls = mockFetch({ failMail: true });
  try { const res = response(); await handler(req(), res); assert.equal(res.code, 502); const patches = calls.filter((c) => c.options.method === 'PATCH'); assert.equal(patches.length, 2); assert.equal(JSON.parse(patches[1].options.body).notify_email_sent_at, null); }
  finally { globalThis.fetch = original; }
});

test('host status email requires organizer and uses reviewed data', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch;
  try {
    mockFetch(); let res = response(); await statusHandler(req(), res); assert.equal(res.code, 403);
    const calls = mockFetch({ user: 'organizer', role: 'organizer', record: { ...host, status: 'Approved' } });
    res = response(); await statusHandler(req(), res); assert.equal(res.code, 200);
    const mail = JSON.parse(calls.find((c) => c.url.includes('api.resend.com')).options.body);
    assert.deepEqual(mail.to, ['user@example.com']); assert.match(mail.html, /Approved/);
  } finally { globalThis.fetch = original; }
});


test('host status email failures return safe, useful categories and release the claim', async () => {
  Object.assign(process.env, env); const original = globalThis.fetch;
  try {
    for (const [status, code] of [[401, 'EMAIL_PROVIDER_AUTH'], [403, 'EMAIL_PROVIDER_FORBIDDEN'], [422, 'EMAIL_PROVIDER_INVALID'], [429, 'EMAIL_PROVIDER_RATE_LIMIT'], [500, 'EMAIL_PROVIDER_UNAVAILABLE']]) {
      const calls = mockFetch({ user: 'organizer', role: 'organizer', record: { ...host, status: 'Approved' }, providerStatus: status });
      const res = response(); await statusHandler(req(), res);
      assert.equal(res.code, 502); assert.equal(res.body.code, code); assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE/);
      const patches = calls.filter((call) => call.options.method === 'PATCH');
      assert.equal(patches.length, 2); assert.equal(JSON.parse(patches[1].options.body).status_email_sent_at, null);
    }
    mockFetch({ user: 'organizer', role: 'organizer', record: { ...host, status: 'Approved' }, mailThrows: true });
    let res = response(); await statusHandler(req(), res); assert.equal(res.body.code, 'EMAIL_DELIVERY_UNKNOWN');
    mockFetch({ user: 'organizer', role: 'organizer', record: { ...host, status: 'Approved' }, providerStatus: 403, releaseFails: true });
    res = response(); await statusHandler(req(), res); assert.equal(res.body.code, 'EMAIL_RETRY_STATE_UNKNOWN');
  } finally { globalThis.fetch = original; }
});
