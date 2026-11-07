import test from 'node:test';
import assert from 'node:assert/strict';
import { sendNotification } from '../src/lib/notifications.js';

test('notification client displays only safe diagnostic categories', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    await sendNotification('send-host-status-email', 'reference', 'token');
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'secret detail', code: 'EMAIL_PROVIDER_FORBIDDEN' }), { status: 502, headers: { 'content-type': 'application/json' } });
    await assert.rejects(sendNotification('send-host-status-email', 'reference', 'token'), /sender domain verification/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'secret detail', code: 'UNEXPECTED' }), { status: 502, headers: { 'content-type': 'application/json' } });
    await assert.rejects(sendNotification('send-host-status-email', 'reference', 'token'), (error) => !error.message.includes('secret detail') && /could not be sent/.test(error.message));
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Invalid session.' }), { status: 401, headers: { 'content-type': 'application/json' } });
    await assert.rejects(sendNotification('send-host-status-email', 'reference', 'token'), /Sign in again/);
    globalThis.fetch = async () => { throw new Error('secret network message'); };
    await assert.rejects(sendNotification('send-host-status-email', 'reference', 'token'), (error) => !error.message.includes('secret') && /Could not reach/.test(error.message));
  } finally { globalThis.fetch = original; }
});
