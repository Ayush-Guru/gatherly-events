-- Apply after migration_security_and_registrations.sql and migration_event_host_requests.sql.
alter table public.registrations add column if not exists refund_status text not null default 'none' check (refund_status in ('none', 'review', 'refunded'));
alter table public.registrations add column if not exists checked_in_at timestamptz;
alter table public.registrations add column if not exists checked_in_by uuid references auth.users(id);
alter table public.registrations add column if not exists reminder_sent_at timestamptz;
alter table public.registrations add column if not exists reminder_claimed_at timestamptz;
alter table public.registrations add column if not exists receipt_email_sent_at timestamptz;
alter table public.event_host_requests add column if not exists status_email_sent_at timestamptz;
alter table public.event_host_requests add column if not exists published_event_id text references public.events(id) on delete set null;
alter table public.events add column if not exists review_count integer not null default 0;

-- Serialise new pending seat claims against each event. Pending requests hold seats
-- until reviewed/cancelled; the database remains the final authority under concurrency.
create or replace function public.reserve_event_capacity() returns trigger language plpgsql security definer set search_path = public as $$
declare available integer; event_start timestamptz;
begin
  if new.status <> 'Pending' then return new; end if;
  select date into event_start from public.events where id = new.event_id for update;
  if event_start is null or event_start <= now() then raise exception 'Registration for this event is closed. If you already paid, contact the organizer with your UTR.'; end if;
  select e.capacity - e.attendees - coalesce((select sum(r.attendees) from public.registrations r where r.event_id = e.id and r.status = 'Pending'), 0)
    into available from public.events e where e.id = new.event_id;
  if available is null or available < new.attendees then raise exception 'Not enough seats remaining. If you already paid, contact the organizer with your UTR.'; end if;
  return new;
end; $$;
drop trigger if exists reserve_event_capacity on public.registrations;
create trigger reserve_event_capacity before insert on public.registrations for each row execute function public.reserve_event_capacity();

create or replace function public.get_event_availability(p_event_id text) returns integer language sql stable security definer set search_path = public as $$
 select case when e.date <= now() then 0 else greatest(0, e.capacity - e.attendees - coalesce((select sum(r.attendees) from public.registrations r where r.event_id = e.id and r.status = 'Pending'), 0))::integer end from public.events e where e.id = p_event_id;
$$;
grant execute on function public.get_event_availability(text) to anon, authenticated;

create or replace function public.guard_event_capacity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.capacity < new.attendees + coalesce((select sum(attendees) from public.registrations where event_id = new.id and status = 'Pending'), 0) then
    raise exception 'Capacity cannot be lower than confirmed and pending seats';
  end if;
  return new;
end; $$;
drop trigger if exists guard_event_capacity on public.events;
create trigger guard_event_capacity before update of capacity on public.events for each row execute function public.guard_event_capacity();

-- Extend the previous guard: no client can grant itself a ticket, refund or check-in.
create or replace function public.guard_registration_changes() returns trigger language plpgsql security definer set search_path = public as $$
declare event_price integer; multiplier numeric;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.user_id <> auth.uid() or new.status <> 'Pending' or new.payment_status <> 'manual_pending' or new.request_email_sent_at is not null or new.status_email_sent_at is not null or new.reminder_sent_at is not null or new.reminder_claimed_at is not null or new.receipt_email_sent_at is not null or new.refund_status <> 'none' or new.checked_in_at is not null or new.checked_in_by is not null then raise exception 'New registrations must start pending'; end if;
    if length(trim(new.transaction_id)) < 6 then raise exception 'A valid transaction ID is required'; end if;
    multiplier := case new.ticket when 'general' then 1 when 'plus' then 1.65 when 'vip' then 2.4 else null end;
    select price into event_price from public.events where id = new.event_id;
    if multiplier is null or event_price is null or new.total <> round(event_price * multiplier * new.attendees) then raise exception 'Invalid ticket or amount'; end if;
  elsif new.user_id = auth.uid() and new.status = 'Cancelled' then
    if old.status not in ('Pending', 'Confirmed') or old.checked_in_at is not null or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then raise exception 'Users may only cancel active, unused registrations'; end if;
    if old.total > 0 then new.refund_status := 'review'; end if;
  elsif public.is_organizer() and old.user_id <> auth.uid() then
    if old.status = 'Pending' and ((new.status = 'Confirmed' and new.payment_status = 'paid') or (new.status = 'Rejected' and new.payment_status = 'rejected')) and (to_jsonb(new) - 'status' - 'payment_status') is not distinct from (to_jsonb(old) - 'status' - 'payment_status') then
      if new.status = 'Rejected' and old.total > 0 then new.refund_status := 'review'; end if;
    elsif old.status = 'Confirmed' and old.checked_in_at is null and new.checked_in_at is not null and new.checked_in_by = auth.uid() and (to_jsonb(new) - 'checked_in_at' - 'checked_in_by') is not distinct from (to_jsonb(old) - 'checked_in_at' - 'checked_in_by') then null;
    elsif old.refund_status = 'review' and new.refund_status = 'refunded' and old.status in ('Cancelled', 'Rejected') and (to_jsonb(new) - 'refund_status') is not distinct from (to_jsonb(old) - 'refund_status') then null;
    else raise exception 'Invalid registration transition'; end if;
  else raise exception 'Not permitted to change this registration'; end if;
  return new;
end; $$;

drop function if exists public.check_in_ticket(text);
create or replace function public.check_in_ticket(ticket_id text, p_event_id text) returns public.registrations language plpgsql security definer set search_path = public as $$
declare result public.registrations;
begin
  if auth.uid() is null or not public.is_organizer() then raise exception 'Organizer access required'; end if;
  update public.registrations set checked_in_at = now(), checked_in_by = auth.uid() where id = ticket_id and event_id = p_event_id and status = 'Confirmed' and checked_in_at is null and user_id <> auth.uid() returning * into result;
  if not found then raise exception 'Ticket is invalid, already checked in, not confirmed, or belongs to you'; end if;
  return result;
end; $$;
revoke all on function public.check_in_ticket(text, text) from public;
grant execute on function public.check_in_ticket(text, text) to authenticated;

create or replace function public.mark_refund_complete(registration_id text) returns public.registrations language plpgsql security definer set search_path = public as $$
declare result public.registrations;
begin
  if auth.uid() is null or not public.is_organizer() then raise exception 'Organizer access required'; end if;
  update public.registrations set refund_status = 'refunded' where id = registration_id and status in ('Cancelled','Rejected') and refund_status = 'review' and user_id <> auth.uid() returning * into result;
  if not found then raise exception 'Refund cannot be marked complete'; end if;
  return result;
end; $$;
revoke all on function public.mark_refund_complete(text) from public;
grant execute on function public.mark_refund_complete(text) to authenticated;

-- Approval and publication are separate: the organizer sets agreed price and capacity.
create or replace function public.publish_host_request(request_id uuid, event_price integer, event_capacity integer, event_image text) returns text language plpgsql security definer set search_path = public as $$
declare host public.event_host_requests; new_id text;
begin
  if auth.uid() is null or not public.is_organizer() then raise exception 'Organizer access required'; end if;
  select * into host from public.event_host_requests where id = request_id for update;
  if not found or host.status <> 'Approved' or host.published_event_id is not null or host.user_id = auth.uid() then raise exception 'Request cannot be published'; end if;
  if host.event_date <= now() or event_price is null or event_price < 0 or event_capacity is null or event_capacity < 1 or event_image is null or event_image !~ '^https?://' then raise exception 'Enter a future event, valid image URL, price and capacity'; end if;
  new_id := 'host-' || host.id::text;
  insert into public.events (id, title, category, date, end_date, venue, city, type, price, capacity, image, gallery, description, long_description, agenda, speakers, tags, organizer_id)
  values (new_id, host.title, host.category, host.event_date, host.event_date + interval '2 hours', host.venue, host.city, 'In person', event_price, event_capacity, event_image, jsonb_build_array(event_image), host.details, host.details, '[]'::jsonb, '[]'::jsonb, '["Community hosted"]'::jsonb, auth.uid());
  update public.event_host_requests set published_event_id = new_id where id = host.id;
  return new_id;
end; $$;
revoke all on function public.publish_host_request(uuid, integer, integer, text) from public;
grant execute on function public.publish_host_request(uuid, integer, integer, text) to authenticated;

-- Reviews require a confirmed, checked-in participant after the event ends.
drop policy if exists "Users manage their reviews" on public.reviews;
drop policy if exists "Attendees write reviews" on public.reviews;
drop policy if exists "Attendees update reviews" on public.reviews;
create policy "Attendees write reviews" on public.reviews for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.registrations r join public.events e on e.id = r.event_id where r.user_id = auth.uid() and r.event_id = reviews.event_id and r.status = 'Confirmed' and r.checked_in_at is not null and coalesce(e.end_date, e.date) <= now()));
create policy "Attendees update reviews" on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from public.registrations r join public.events e on e.id = r.event_id where r.user_id = auth.uid() and r.event_id = reviews.event_id and r.status = 'Confirmed' and r.checked_in_at is not null and coalesce(e.end_date, e.date) <= now()));
create or replace function public.sync_event_rating() returns trigger language plpgsql security definer set search_path = public as $$
declare affected_id text;
begin
  affected_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  update public.events set rating = coalesce((select round(avg(rating), 1) from public.reviews where event_id = affected_id), 0), review_count = (select count(*) from public.reviews where event_id = affected_id) where id = affected_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create or replace function public.guard_review_identity() returns trigger language plpgsql as $$
begin
  if new.user_id <> old.user_id or new.event_id <> old.event_id then raise exception 'Review identity cannot change'; end if;
  return new;
end; $$;
drop trigger if exists guard_review_identity on public.reviews;
create trigger guard_review_identity before update on public.reviews for each row execute function public.guard_review_identity();
drop trigger if exists sync_event_rating on public.reviews;
create trigger sync_event_rating after insert or update or delete on public.reviews for each row execute function public.sync_event_rating();
-- Backfill installations that already had persisted reviews.
update public.events e set rating = coalesce((select round(avg(r.rating), 1) from public.reviews r where r.event_id = e.id), 0), review_count = (select count(*) from public.reviews r where r.event_id = e.id);

-- Only organizers can upload; the public bucket is for public event art, not private data.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('event-images', 'event-images', true, 5242880, array['image/jpeg','image/png','image/webp']) on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Organizers upload event images" on storage.objects;
create policy "Organizers upload event images" on storage.objects for insert to authenticated with check (bucket_id = 'event-images' and public.is_organizer() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Public read event images" on storage.objects;
create policy "Public read event images" on storage.objects for select to public using (bucket_id = 'event-images');
-- Newly added host metadata may only be set by trusted server/review operations.
drop policy if exists "Users submit host requests" on public.event_host_requests;
create policy "Users submit host requests" on public.event_host_requests for insert to authenticated with check (
  user_id = auth.uid() and status = 'Pending' and reviewed_at is null and reviewed_by is null and notify_email_sent_at is null and status_email_sent_at is null and published_event_id is null
);
