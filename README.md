# Gatherly — Event discovery platform

Gatherly is a responsive event management website built with React, Vite, Tailwind CSS, and JavaScript. Users can discover events, save plans, pay through a UPI QR, submit a UTR, and receive confirmation after organizer approval.

**Live website:** https://gatherly-events-sepia.vercel.app

## Technology stack

React, JavaScript, Vite and Tailwind CSS power the frontend. Supabase provides authentication, PostgreSQL and storage; Vercel hosts the site and serverless API functions. Resend or Gmail SMTP can be used for configured host and registration notifications. Scheduled reminders currently use Resend.

## Features

- Responsive homepage with featured and upcoming events
- Search, category, city, format, price, and sorting filters
- Event detail pages with gallery, agenda, speakers, ratings, and directions
- Dark/light mode and English/Hindi toggle
- Saved events with LocalStorage/Supabase sync
- UPI QR payment using the configured `VITE_UPI_ID` (no hard-coded fallback)
- UTR/transaction ID submission
- Pending → Confirmed/Rejected approval workflow
- Organizer email notification for new payment requests
- Organizer-only studio with host review, ticket check-in, refund review and email retry controls
- Confirmation email after approval or rejection
- QR-code ticket after approval
- Downloadable ticket and calendar file
- User dashboard for registrations, refund status, saved events, and verified-attendee ratings
- Database-enforced seat limits, including pending requests
- Organizer-only image uploads and scheduled email reminders
- Organizer event create/edit/delete tools
- Host event requests with organizer review and email notification
- Password reset by email
- Scroll reveal, hover, modal, toast, and reduced-motion support
- PWA manifest and service worker

## Run locally

```bash
npm install
npm run dev
```

Open **http://localhost:5173**.

## Production setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**.
3. Run [`supabase/schema.sql`](supabase/schema.sql).
4. Optionally run [`supabase/seed.sql`](supabase/seed.sql) **only in a disposable test project** to add demo events. Do not run it on production.
5. Enable Email under **Authentication → Providers**.
6. Copy the Project URL and public anon key from **Project Settings → API**.
7. Under **Authentication → URL Configuration**, add your deployed `https://your-domain.com/reset-password` and (for local testing) `http://localhost:5173/reset-password` to the redirect URL allowlist. Password recovery requires a working Supabase email provider.
8. After creating your account, run this once in SQL Editor with your auth user ID to unlock approvals:

```sql
update public.profiles set role = 'organizer' where id = 'YOUR-AUTH-USER-ID';
```

If you already ran an older schema, run [`supabase/migration_manual_payments.sql`](supabase/migration_manual_payments.sql) if needed, then run **[`supabase/migration_security_and_registrations.sql`](supabase/migration_security_and_registrations.sql)**. This security migration is required before accepting payments on an existing installation. New installations get the same rules from `schema.sql`. For existing installations also run [`supabase/migration_event_host_requests.sql`](supabase/migration_event_host_requests.sql), then [`supabase/migration_operations.sql`](supabase/migration_operations.sql). Run these in order **before deploying** the updated frontend. Then apply [`supabase/migration_payment_holds.sql`](supabase/migration_payment_holds.sql) for the new booking flow. Fresh installs already include these migrations in `schema.sql`. **Coordinate rollout carefully**: back up the database and test on a separate project, then apply the migration and deploy the matching frontend. Existing pending bookings and old clients remain supported, but old browser tabs do not use seat holds and can still take payment before discovering a sellout. Pause payments during rollout and ask users to refresh; test before accepting payments.

### 2. Environment variables

```bash
cp .env.example .env.local
```

Add the Supabase values and set your actual payment details (examples only; do not use a placeholder in production):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_UPI_ID=your-upi-id@bank
VITE_ORGANIZER_EMAIL=organizer@example.com
```

### 3. Email notifications

#### Option A: Gmail SMTP (host and registration emails)

For low-volume use, enable 2-Step Verification on the Gmail account and create a Google App Password if available for the account. Set these **server-only** Vercel variables, then redeploy:

```env
EMAIL_PROVIDER=gmail
GMAIL_SMTP_USER=your-address@gmail.com
GMAIL_SMTP_APP_PASSWORD=your-google-app-password
ORGANIZER_EMAIL=organizer@example.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

Never use your normal Google password, send an App Password in chat, commit it, or add a `VITE_` prefix. Gmail availability, limits, spam filtering and delivery depend on Google and account settings. Google may not offer App Passwords for every account. Gmail is used for host and registration emails; scheduled reminders remain on Resend and require its configuration and `CRON_SECRET`. Supabase authentication emails are configured separately in Supabase. SMTP does not provide provider-level idempotency; if delivery is uncertain, check Gmail Sent before retrying to avoid duplicates. An accepted send is not proof of inbox delivery.

#### Option B: Resend

1. Leave `EMAIL_PROVIDER` unset or set it to `resend`.
2. Create an account at [resend.com](https://resend.com).
3. Verify the sending domain.
4. Create an API key.
5. Add these server-only variables to Vercel (the included `api/` handlers use Vercel-style serverless functions):

```env
RESEND_API_KEY=re_...
EMAIL_FROM=Gatherly <hello@your-domain.com>
ORGANIZER_EMAIL=organizer@example.com
APP_URL=https://your-domain.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
CRON_SECRET=a-long-random-server-only-secret
```

The service-role key must never be exposed in frontend code or committed to GitHub.

### 4. Deploy on Vercel

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Add all environment variables under **Project Settings → Environment Variables**.
4. Deploy.
5. Set `APP_URL` to the deployed domain and redeploy.

The serverless endpoints are:

```text
/api/send-registration-request
/api/send-registration-status-email
/api/send-host-request
/api/send-host-status-email
/api/send-registration-receipt
/api/send-event-reminders
```

### Host request flow

A signed-in user selects **Host an event**, submits their contact and event details, and can see the request status on that page. Organizers see pending requests in **Organizer studio** and can approve or decline them; the organizer also receives an email if the server notification service is configured. Approval does not publish automatically: contact the host to agree on price, capacity and payment arrangements, then use **Publish event**. Hosts receive an approval/decline email when email is configured and can see their request and published-event link on the host page. Published event payments go to the configured Gatherly UPI account, not automatically to the host.

### 5. User flow

1. The signed-in user enters details and selects a pass. For a paid event, a database transaction calculates the amount and creates a 15-minute seat hold before displaying the configured UPI QR. Free events are submitted without payment.
2. The user pays and submits the UTR before the hold expires. The UTR is manually checked by an organizer; the request remains pending until reviewed.
3. An expired or released hold does not reserve a seat. A user who already paid can submit the UTR from the reservation or **My Gatherly**; it is recorded as cancelled with refund review. Contact the organizer; no refund is automatic. Do not pay after expiry.
4. An organizer verifies the payment and accepts or rejects the request. Confirmed users can see their QR ticket in **My Gatherly**. Submitted pending requests still hold seats until reviewed or cancelled.
5. Events with booking history cannot be deleted, protecting registrations and late-payment recovery records.

## Important security notes

- UPI payments are manually verified through the UTR; the QR is not a payment gateway and does not verify or settle transactions. Never publish with an unverified UPI ID.
- The app does not automatically verify bank payment status. An authorized organizer must verify the UTR manually. Refunds are not automatic: cancellation/rejection enters manual review and the organizer must transfer any eligible refund outside the app before marking it complete.
- Ticket check-in requires organizer access and is one-time per booking (including every attendee on that booking). Camera QR scanning requires HTTPS, camera permission and browser BarcodeDetector support; manual reference entry is available as a fallback. QR codes are bearer tokens: anyone with a copy can present one, so organizers should check identity when needed.
- Submitted payment requests and free requests hold capacity indefinitely until approved, rejected or cancelled. Unpaid holds expire after 15 minutes (or event start, whichever comes first), without requiring cron. The database clock is authoritative. A hold is not a payment or ticket confirmation; UPI verification and refunds remain manual.
- The daily Vercel cron in `vercel.json` runs at 03:00 UTC, emails confirmed attendees for events within 48 hours, and processes at most 100 per run. Configure `CRON_SECRET` and the server email variables; monitor cron failures. For higher volume or guaranteed delivery, use a durable job queue. Failed reminder sends can retry on the next run while the event is still upcoming.
- In local mode without Supabase, event browsing works but registrations, payments, and organizer tools are disabled.
- Email notifications use the stored registration and require a valid session; organizer status emails additionally require an organizer role. Delivery errors are shown but do not undo an already-saved registration or review.
- For Resend production emails, use a verified sender domain. Gmail SMTP is intended for low-volume use and has account-specific limits.
- Enable Supabase email confirmation in production.
- Keep `.env.local` out of GitHub; `.gitignore` already excludes it.
- Never commit the Supabase service-role key.

## Verification

```bash
npm run build
npm test
node --check api/send-registration-request.js
node --check api/send-registration-status-email.js
```

Automated email tests use mocked Supabase and email providers; the SQL tests use an embedded Postgres with stubbed Supabase auth/storage. Test the SQL migration, authentication, payment review, and email delivery in a controlled end-to-end test before production use. Use a verified domain for Resend, or a configured Gmail App Password for Gmail SMTP.

To test concurrent last-seat reservations against a **disposable local PostgreSQL** cluster, set `GATHERLY_TEST_PG_SOCKET` to its Unix socket directory under `/tmp` and optionally set `GATHERLY_TEST_PG_PORT`, then run `npm test`. The test creates and drops a randomly named database and creates test roles on that cluster; never point it at a shared or production database. Without the socket variable it is skipped. This is still not a Supabase integration test.
