-- Run after schema.sql (or migration_manual_payments.sql) on existing installations.
-- Make organizer checks independent of profiles RLS, without granting profile write access.
create or replace function public.is_organizer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('organizer', 'admin'));
$$;
revoke all on function public.is_organizer() from public;
grant execute on function public.is_organizer() to authenticated;

drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "Organizers manage their events" on public.events;
create policy "Organizers manage their events" on public.events for all to authenticated using (public.is_organizer()) with check (public.is_organizer());
drop policy if exists "Organizers review registrations" on public.registrations;
create policy "Organizers review registrations" on public.registrations for select to authenticated using (public.is_organizer());
drop policy if exists "Organizers approve registrations" on public.registrations;
create policy "Organizers approve registrations" on public.registrations for update to authenticated using (public.is_organizer()) with check (public.is_organizer());
drop policy if exists "Users cancel their registrations" on public.registrations;
create policy "Users cancel their registrations" on public.registrations for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Preserve history while allowing a fresh registration after cancellation or rejection.
alter table public.registrations drop constraint if exists registrations_user_id_event_id_key;
create unique index if not exists registrations_one_active_per_event on public.registrations(user_id, event_id) where status in ('Pending', 'Confirmed');
alter table public.registrations add column if not exists request_email_sent_at timestamptz;
alter table public.registrations add column if not exists status_email_sent_at timestamptz;

create or replace function public.guard_registration_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare event_price integer; multiplier numeric;
begin
  -- Service-role/SQL administration is trusted. Authenticated clients are not.
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.user_id <> auth.uid() or new.status <> 'Pending' or new.payment_status <> 'manual_pending' or new.request_email_sent_at is not null or new.status_email_sent_at is not null then
      raise exception 'New registrations must start pending';
    end if;
    if length(trim(new.transaction_id)) < 6 then raise exception 'A valid transaction ID is required'; end if;
    multiplier := case new.ticket when 'general' then 1 when 'plus' then 1.65 when 'vip' then 2.4 else null end;
    select price into event_price from public.events where id = new.event_id;
    if multiplier is null or event_price is null or new.total <> round(event_price * multiplier * new.attendees) then
      raise exception 'Invalid ticket or amount';
    end if;
  elsif new.user_id = auth.uid() and new.status = 'Cancelled' then
    if old.status not in ('Pending', 'Confirmed') or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Users may only cancel active registrations';
    end if;
  elsif public.is_organizer() and old.user_id <> auth.uid() then
    if old.status <> 'Pending' or not ((new.status = 'Confirmed' and new.payment_status = 'paid') or (new.status = 'Rejected' and new.payment_status = 'rejected')) or (to_jsonb(new) - 'status' - 'payment_status') is distinct from (to_jsonb(old) - 'status' - 'payment_status') then
      raise exception 'Invalid review transition';
    end if;
  else
    raise exception 'Not permitted to change this registration';
  end if;
  return new;
end; $$;
drop trigger if exists guard_registration_changes on public.registrations;
create trigger guard_registration_changes before insert or update on public.registrations for each row execute function public.guard_registration_changes();

create or replace function public.sync_event_attendees() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'Confirmed' then
    update public.events set attendees = attendees + new.attendees where id = new.event_id;
  elsif tg_op = 'UPDATE' and old.status <> 'Confirmed' and new.status = 'Confirmed' then
    update public.events set attendees = attendees + new.attendees where id = new.event_id;
  elsif tg_op = 'UPDATE' and old.status = 'Confirmed' and new.status <> 'Confirmed' then
    update public.events set attendees = greatest(0, attendees - old.attendees) where id = old.event_id;
  end if;
  return new;
end; $$;
