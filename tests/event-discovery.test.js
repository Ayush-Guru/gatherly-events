import test from 'node:test';
import assert from 'node:assert/strict';
import { eventCities, isUpcoming, sortSoonest } from '../src/lib/eventDiscovery.js';

const now = Date.parse('2026-11-07T12:00:00Z');
test('upcoming events exclude already-started events, including the exact start time', () => {
  assert.equal(isUpcoming({ date: '2026-11-07T12:00:01Z' }, now), true);
  assert.equal(isUpcoming({ date: '2026-11-07T12:00:00Z' }, now), false);
  assert.equal(isUpcoming({ date: '2026-11-06T12:00:00Z' }, now), false);
});
test('soonest shows future events first and keeps past events accessible, most recent first', () => {
  const events = [
    { id: 'old', date: '2026-10-01T12:00:00Z' },
    { id: 'later', date: '2026-12-01T12:00:00Z' },
    { id: 'recent', date: '2026-11-06T12:00:00Z' },
    { id: 'soon', date: '2026-11-08T12:00:00Z' },
  ];
  assert.deepEqual(sortSoonest(events, now).map((event) => event.id), ['soon', 'later', 'recent', 'old']);
  assert.equal(events[0].id, 'old', 'sorting does not mutate the original list');
});
test('city options come from the catalogue without duplicate or empty entries', () => {
  assert.deepEqual(eventCities([{ city: 'Pune' }, { city: 'Jaipur' }, { city: 'Pune' }, { city: '' }]), ['Jaipur', 'Pune']);
});
