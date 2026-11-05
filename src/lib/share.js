export async function shareEvent(event) {
  const shareData = { title: event.title, text: event.description, url: `${window.location.origin}/events/${event.id}` };
  if (navigator.share) { await navigator.share(shareData); return 'shared'; }
  await navigator.clipboard?.writeText(shareData.url);
  return 'copied';
}
