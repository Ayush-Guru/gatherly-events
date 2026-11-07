// Only display predefined, non-sensitive error categories from our own API.
const messages = {
  AUTH_SERVER_CONFIG: 'The server authentication configuration was rejected. Check the Supabase server credentials.',
  AUTH_SERVICE_UNAVAILABLE: 'Could not reach the authentication service. Please try again later.',
  AUTH_SESSION_UNVERIFIED: 'Could not verify your sign-in. If signing in again does not help, check the server Supabase configuration.',
  EMAIL_NOT_CONFIGURED: 'Email service is not configured. Check server settings.',
  EMAIL_PROVIDER_AUTH: 'Email provider rejected the API key. Check the server configuration.',
  EMAIL_PROVIDER_FORBIDDEN: 'Email provider refused the request. Check sender domain verification, API key permissions and recipient restrictions.',
  EMAIL_PROVIDER_INVALID: 'Email provider rejected the email details. Check the sender and recipient settings.',
  EMAIL_PROVIDER_RATE_LIMIT: 'Email provider rate limit reached. Please try again later.',
  EMAIL_PROVIDER_UNAVAILABLE: 'Email provider could not complete the request. Check the provider dashboard before retrying.',
  EMAIL_DELIVERY_UNKNOWN: 'Email delivery could not be confirmed. Check the provider dashboard before retrying to avoid duplicates.',
  EMAIL_RETRY_STATE_UNKNOWN: 'Email status could not be reset. Check the email provider before retrying to avoid duplicates.',
};

export async function sendNotification(endpoint, reference, token) {
  let response;
  try {
    response = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reference }),
    });
  } catch { throw new Error('Could not reach the email service. Check your connection and try again.'); }
  let result;
  try {
    if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Unexpected response');
    result = await response.json();
  } catch { throw new Error('Email notification could not be sent. Please try again.'); }
  if (response.ok && result?.ok) return;
  if (Object.hasOwn(messages, result?.code)) throw new Error(messages[result.code]);
  if (response.status === 401) throw new Error('Your session may have expired. Sign in again and retry.');
  if (response.status === 403) throw new Error('Organizer access is required to send this email.');
  if (response.status === 409) throw new Error('The notification was already sent or the request changed. Refresh to check.');
  throw new Error('Email notification could not be sent. Check server configuration and try again.');
}

// Read the current Supabase session at send time; getSession refreshes expired tokens.
export async function getNotificationToken(supabase) {
  if (!supabase) throw new Error('Sign-in service is not configured.');
  let result;
  try { result = await supabase.auth.getSession(); }
  catch { throw new Error('Could not get your current session. Please sign in again.'); }
  if (result.error || !result.data?.session?.access_token) throw new Error('Could not get your current session. Please sign in again.');
  return result.data.session.access_token;
}
