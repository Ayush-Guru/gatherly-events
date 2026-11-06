// Registration closes at the event's start, so only future events belong in
// "upcoming" sections. Keep past events discoverable for their details/reviews.
export function isUpcoming(event, now = Date.now()) {
  return new Date(event.date).getTime() > now;
}

export function sortSoonest(events, now = Date.now()) {
  return [...events].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    const aUpcoming = aTime > now;
    const bUpcoming = bTime > now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? aTime - bTime : bTime - aTime;
  });
}

export function eventCities(events) {
  return [...new Set(events.map(({ city }) => city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
