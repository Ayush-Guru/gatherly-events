// Email failures must not undo a registration or a completed review.
export async function sendNotification(endpoint, reference, token) {
  const response = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reference }),
  });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Email notification could not be sent.');
  const result = await response.json();
  if (!result.ok) throw new Error('Email notification could not be sent.');
}
