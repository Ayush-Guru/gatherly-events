export function downloadCalendar(event) {
  const start = new Date(event.date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(event.endDate || new Date(new Date(event.date).getTime() + 3 * 3600000)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const content = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gatherly//Events//EN', 'BEGIN:VEVENT', `UID:${event.id}@gatherly`, `DTSTAMP:${start}`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${event.title}`, `LOCATION:${event.venue}, ${event.city}`, `DESCRIPTION:${event.description}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/calendar' }));
  link.download = `${event.id}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function googleCalendarUrl(event) {
  const start = new Date(event.date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(event.endDate || new Date(new Date(event.date).getTime() + 3 * 3600000)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${start}/${end}`, details: event.description, location: `${event.venue}, ${event.city}` });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
