# Gatherly — Event discovery platform

Gatherly is a responsive event management website built with React, Vite, Tailwind CSS, and JavaScript. Users can discover events, save plans, pay through a UPI QR, submit a UTR, and receive confirmation after organizer approval.

## Features

- Responsive homepage with featured and upcoming events
- Search, category, city, format, price, and sorting filters
- Event detail pages with gallery, agenda, speakers, ratings, and directions
- Dark/light mode and English/Hindi toggle
- Saved events with LocalStorage/Supabase sync
- UPI QR payment using `7587704110@fam`
- UTR/transaction ID submission
- Pending → Confirmed/Rejected approval workflow
- Organizer email notification for new payment requests
- Organizer dashboard with Accept/Reject controls
- Confirmation email after approval or rejection
- QR-code ticket after approval
- Downloadable ticket and calendar file
- User dashboard for registrations, status, saved events, and ratings
- Organizer event create/edit/delete tools
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
4. Run [`supabase/seed.sql`](supabase/seed.sql).
5. Enable Email under **Authentication → Providers**.
6. Copy the Project URL and public anon key from **Project Settings → API**.
7. After creating your account, run this once in SQL Editor with your auth user ID to unlock approvals:

```sql
update public.profiles set role = 'organizer' where id = 'YOUR-AUTH-USER-ID';
```

If you already ran an older schema, run [`supabase/migration_manual_payments.sql`](supabase/migration_manual_payments.sql) instead of running the full schema again.

### 2. Environment variables

```bash
cp .env.example .env.local
```

Add the Supabase values and keep these payment details:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_UPI_ID=7587704110@fam
VITE_ORGANIZER_EMAIL=ayushguru16@gmail.com
```

### 3. Resend email notifications

1. Create an account at [resend.com](https://resend.com).
2. Verify the sending domain.
3. Create an API key.
4. Add these server-only variables to Vercel/Netlify:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=Gatherly <hello@your-domain.com>
ORGANIZER_EMAIL=ayushguru16@gmail.com
APP_URL=https://your-domain.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
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
```

### 5. User flow

1. User opens an event and clicks **Reserve your seat**.
2. User scans the UPI QR and pays the displayed amount.
3. User enters name, email, phone, attendees, and UTR.
4. The registration is stored as **Pending**.
5. Organizer receives an email at `ayushguru16@gmail.com`.
6. Organizer opens **Organizer studio** and selects **Accept payment** or **Reject**.
7. User receives an email and sees the updated status in **My Gatherly**.
8. Accepted users receive an active QR ticket.

## Important security notes

- UPI payments are manually verified through the UTR.
- The app does not automatically verify bank payment status.
- Use a verified Resend domain in production.
- Enable Supabase email confirmation in production.
- Keep `.env.local` out of GitHub; `.gitignore` already excludes it.
- Never commit the Supabase service-role key.

## Verification

```bash
npm run build
node --check api/send-registration-request.js
node --check api/send-registration-status-email.js
```

The current project has also been smoke-tested for event search, event details, invalid form validation, registration persistence, theme persistence, mobile overflow, organizer rendering, and browser console errors.
