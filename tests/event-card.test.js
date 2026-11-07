import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('event cards show venue and city alongside other event details', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const oldLocalStorage = globalThis.localStorage;
  const oldSessionStorage = globalThis.sessionStorage;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  try {
    const { default: EventCard } = await server.ssrLoadModule('/src/components/events/EventCard.jsx');
    const { AppProvider } = await server.ssrLoadModule('/src/context/AppContext.jsx');
    const { AuthProvider } = await server.ssrLoadModule('/src/context/AuthContext.jsx');
    const event = { id: 'test-event', title: 'A creative meetup', date: '2027-01-20T10:00:00Z', venue: 'The Studio Hall', city: 'Mumbai', image: 'https://example.com/event.jpg', category: 'Design', description: 'A friendly gathering.', attendees: 0 };
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement(AuthProvider, null, React.createElement(AppProvider, null,
        React.createElement(EventCard, { event })))));
    for (const text of ['A creative meetup', new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(event.date)), 'The Studio Hall', 'Mumbai', 'A friendly gathering.']) assert.ok(html.includes(text), `missing ${text}`);
    assert.match(html, /src="https:\/\/example\.com\/event\.jpg"/);
  } finally {
    globalThis.localStorage = oldLocalStorage;
    globalThis.sessionStorage = oldSessionStorage;
    await server.close();
  }
});
