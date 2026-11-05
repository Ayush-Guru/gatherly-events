-- Apply after migration_security_and_registrations.sql (already in fresh schema.sql).
create table if not exists public.event_host_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_name text not null check (length(trim(contact_name)) between 2 and 120),
  contact_email text not null check (length(trim(contact_email)) between 3 and 254),
  contact_phone text not null check (length(trim(contact_phone)) between 8 and 30),
  title text not null check (length(trim(title)) between 3 and 160),
  category text not null check (category in ('Design', 'Technology', 'Culture', 'Music', 'Community', 'Food')),
  event_date timestamptz not null,
  city text not null check (length(trim(city)) between 2 and 100),
  venue text not null check (length(trim(venue)) between 2 and 200),
  details text not null check (length(trim(details)) between 10 and 3000),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Declined')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  notify_email_sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.event_host_requests enable row level security;
drop policy if exists "Users submit host requests" on public.event_host_requests;
create policy "Users submit host requests" on public.event_host_requests for insert to authenticated with check (
  user_id = auth.uid() and status = 'Pending' and reviewed_at is null and reviewed_by is null and notify_email_sent_at is null
);
drop policy if exists "Users view own host requests" on public.event_host_requests;
create policy "Users view own host requests" on public.event_host_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists "Organizers view host requests" on public.event_host_requests;
create policy "Organizers view host requests" on public.event_host_requests for select to authenticated using (public.is_organizer());

-- Only the trusted RPC can review; users cannot edit/approve requests directly.
create or replace function public.review_host_request(request_id uuid, decision text) returns public.event_host_requests
language plpgsql security definer set search_path = public as $$
declare result public.event_host_requests;
begin
  if auth.uid() is null or not public.is_organizer() then raise exception 'Organizer access required'; end if;
  if decision not in ('Approved', 'Declined') or decision is null then raise exception 'Invalid decision'; end if;
  update public.event_host_requests set status = decision, reviewed_at = now(), reviewed_by = auth.uid()
    where id = request_id and status = 'Pending' and user_id <> auth.uid() returning * into result;
  if not found then raise exception 'Request is no longer pending or cannot be reviewed by its owner'; end if;
  return result;
end; $$;
revoke all on function public.review_host_request(uuid, text) from public;
grant execute on function public.review_host_request(uuid, text) to authenticated;
