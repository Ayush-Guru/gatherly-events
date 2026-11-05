import { sendHostRequest } from '../server/host-notification.js';
export default function handler(request, response) { return sendHostRequest(request, response); }
