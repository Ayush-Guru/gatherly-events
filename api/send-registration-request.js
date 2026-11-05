import { sendRegistrationEmail } from '../server/notification.js';
export default function handler(request, response) { return sendRegistrationEmail(request, response, 'request'); }
