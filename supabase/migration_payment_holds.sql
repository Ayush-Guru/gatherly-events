-- Apply after migration_operations.sql. Existing submitted pending registrations
-- retain their seats and the previous review workflow during rollout.
alter table public.registrations add column if not exists payment_hold_expires_at timestamptz;

-- Keep legacy clients working during rollout. The new frontend uses an RPC that
-- calculates amounts on the server; all inserts still pass the capacity guard.
drop policy if exists "Users create their registrations" on public.registrations;
create policy "Users create their registrations" on public.registrations for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.reserve_event_capacity() returns trigger language plpgsql security definer set search_path = public as $$
declare available integer; event_start timestamptz;
begin
  if new.status <> 'Pending' then return new; end if;
  select date into event_start from public.events where id = new.event_id for update;
  if event_start is null or event_start <= clock_timestamp() then raise exception 'Registration for this event is closed.'; end if;
  select e.capacity - e.attendees - coalesce((select sum(r.attendees) from public.registrations r where r.event_id = e.id and r.status = 'Pending' and (r.transaction_id <> 'AWAITING-UPI' or r.payment_hold_expires_at is null or r.payment_hold_expires_at > clock_timestamp())), 0)
    into available from public.events e where e.id = new.event_id;
  if available is null or available < new.attendees then raise exception 'Not enough seats remaining.'; end if;
  return new;
end; $$;

create or replace function public.get_event_availability(p_event_id text) returns integer language sql stable security definer set search_path = public as $$
 select case when e.date <= now() then 0 else greatest(0, e.capacity - e.attendees - coalesce((select sum(r.attendees) from public.registrations r where r.event_id = e.id and r.status = 'Pending' and (r.transaction_id <> 'AWAITING-UPI' or r.payment_hold_expires_at is null or r.payment_hold_expires_at > now())), 0))::integer end from public.events e where e.id = p_event_id;
$$;

create or replace function public.guard_event_capacity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.capacity < new.attendees + coalesce((select sum(attendees) from public.registrations where event_id = new.id and status = 'Pending' and (transaction_id <> 'AWAITING-UPI' or payment_hold_expires_at is null or payment_hold_expires_at > clock_timestamp())), 0) then
    raise exception 'Capacity cannot be lower than confirmed and held seats';
  end if;
  return new;
end; $$;

create or replace function public.guard_registration_changes() returns trigger language plpgsql security definer set search_path = public as $$
declare event_price integer; event_start timestamptz; multiplier numeric;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.user_id <> auth.uid() or new.status <> 'Pending' or new.payment_status <> 'manual_pending' or new.request_email_sent_at is not null or new.status_email_sent_at is not null or new.reminder_sent_at is not null or new.reminder_claimed_at is not null or new.receipt_email_sent_at is not null or new.refund_status <> 'none' or new.checked_in_at is not null or new.checked_in_by is not null or new.payment_hold_expires_at is not null then raise exception 'New registrations must start pending'; end if;
    multiplier := case new.ticket when 'general' then 1 when 'plus' then 1.65 when 'vip' then 2.4 else null end;
    select price, date into event_price, event_start from public.events where id = new.event_id for update;
    if multiplier is null or event_price is null or new.total <> round(event_price * multiplier * new.attendees) then raise exception 'Invalid ticket or amount'; end if;
    if new.total = 0 then
      if new.transaction_id <> 'FREE-EVENT' then raise exception 'Invalid free registration'; end if;
    else
      if new.transaction_id = 'AWAITING-UPI' then
        new.payment_hold_expires_at := least(clock_timestamp() + interval '15 minutes', event_start);
      elsif length(trim(new.transaction_id)) < 6 or length(trim(new.transaction_id)) > 100 or upper(trim(new.transaction_id)) in ('AWAITING-UPI','FREE-EVENT') then
        raise exception 'Enter a valid UTR';
      end if;
    end if;
  elsif new.user_id = auth.uid() and old.transaction_id = 'AWAITING-UPI' and old.payment_hold_expires_at is not null and old.status in ('Pending','Cancelled') and new.transaction_id <> old.transaction_id then
    if (to_jsonb(new) - 'transaction_id') is distinct from (to_jsonb(old) - 'transaction_id') or length(trim(new.transaction_id)) < 6 or length(trim(new.transaction_id)) > 100 or upper(trim(new.transaction_id)) in ('AWAITING-UPI','FREE-EVENT') then raise exception 'Enter a valid UTR'; end if;
    perform 1 from public.events where id=old.event_id for update;
    new.transaction_id := trim(new.transaction_id);
    if old.status = 'Cancelled' or old.payment_hold_expires_at <= clock_timestamp() then
      new.status := 'Cancelled'; new.refund_status := 'review';
    end if;
  elsif new.user_id = auth.uid() and new.status = 'Cancelled' then
    if old.status not in ('Pending', 'Confirmed') or old.checked_in_at is not null or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then raise exception 'Users may only cancel active, unused registrations'; end if;
    if old.total > 0 and old.transaction_id <> 'AWAITING-UPI' then new.refund_status := 'review'; end if;
  elsif public.is_organizer() and old.user_id <> auth.uid() then
    if old.status = 'Pending' and old.transaction_id <> 'AWAITING-UPI' and ((new.status = 'Confirmed' and new.payment_status = 'paid') or (new.status = 'Rejected' and new.payment_status = 'rejected')) and (to_jsonb(new) - 'status' - 'payment_status') is not distinct from (to_jsonb(old) - 'status' - 'payment_status') then
      if new.status = 'Rejected' and old.total > 0 then new.refund_status := 'review'; end if;
    elsif old.status = 'Confirmed' and old.checked_in_at is null and new.checked_in_at is not null and new.checked_in_by = auth.uid() and (to_jsonb(new) - 'checked_in_at' - 'checked_in_by') is not distinct from (to_jsonb(old) - 'checked_in_at' - 'checked_in_by') then null;
    elsif old.refund_status = 'review' and new.refund_status = 'refunded' and old.status in ('Cancelled','Rejected') and (to_jsonb(new) - 'refund_status') is not distinct from (to_jsonb(old) - 'refund_status') then null;
    else raise exception 'Invalid registration transition'; end if;
  else raise exception 'Not permitted to change this registration'; end if;
  return new;
end; $$;

create or replace function public.create_booking_hold(p_event_id text, p_name text, p_email text, p_phone text, p_attendees integer, p_ticket text) returns public.registrations
language plpgsql security definer set search_path = public as $$
declare event_price integer; event_start timestamptz; multiplier numeric; amount integer; result public.registrations;
begin
  if auth.uid() is null then raise exception 'Sign in before reserving'; end if;
  if length(trim(coalesce(p_name,''))) not between 3 and 120 or length(trim(coalesce(p_email,''))) not between 3 and 254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(trim(coalesce(p_phone,''))) not between 8 and 30 or p_attendees is null or p_attendees not between 1 and 8 then raise exception 'Enter valid booking details'; end if;
  multiplier := case p_ticket when 'general' then 1 when 'plus' then 1.65 when 'vip' then 2.4 else null end;
  if multiplier is null then raise exception 'Invalid ticket'; end if;
  select price, date into event_price, event_start from public.events where id=p_event_id for update;
  if event_price is null or event_price < 0 or event_start <= clock_timestamp() then raise exception 'Registration for this event is closed'; end if;
  -- Expired holds stop consuming capacity even without a scheduled cleanup job.
  update public.registrations set status='Cancelled' where user_id=auth.uid() and event_id=p_event_id and status='Pending' and transaction_id='AWAITING-UPI' and payment_hold_expires_at <= clock_timestamp();
  if exists (select 1 from public.registrations where user_id=auth.uid() and event_id=p_event_id and status in ('Pending','Confirmed')) then raise exception 'You already have an active registration or hold'; end if;
  amount := round(event_price * multiplier * p_attendees);
  insert into public.registrations (id,user_id,event_id,name,email,phone,attendees,ticket,total,transaction_id,status,payment_status)
    values ('GTH-' || gen_random_uuid()::text,auth.uid(),p_event_id,trim(p_name),trim(p_email),trim(p_phone),p_attendees,p_ticket,amount,case when amount=0 then 'FREE-EVENT' else 'AWAITING-UPI' end,'Pending','manual_pending') returning * into result;
  return result;
end; $$;
revoke all on function public.create_booking_hold(text,text,text,text,integer,text) from public;
grant execute on function public.create_booking_hold(text,text,text,text,integer,text) to authenticated;

create or replace function public.submit_upi_reference(p_registration_id text, p_utr text) returns public.registrations
language plpgsql security definer set search_path = public as $$
declare result public.registrations; booking_event text;
begin
  if auth.uid() is null then raise exception 'Sign in before submitting a payment reference'; end if;
  select event_id into booking_event from public.registrations where id=p_registration_id and user_id=auth.uid();
  if booking_event is null then raise exception 'Reservation not found'; end if;
  perform 1 from public.events where id=booking_event for update;
  select * into result from public.registrations where id=p_registration_id and user_id=auth.uid() for update;
  if not found then raise exception 'Reservation not found'; end if;
  if result.transaction_id <> 'AWAITING-UPI' then
    if result.transaction_id = trim(p_utr) then return result; end if;
    raise exception 'A payment reference has already been submitted';
  end if;
  update public.registrations set transaction_id=trim(p_utr) where id=result.id returning * into result;
  return result;
end; $$;
revoke all on function public.submit_upi_reference(text,text) from public;
grant execute on function public.submit_upi_reference(text,text) to authenticated;

-- Never cascade-delete bookings or lose a late-payment recovery record.
create or replace function public.protect_booked_event() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.registrations where event_id=old.id) then raise exception 'Cannot delete an event with booking history'; end if;
  return old;
end; $$;
drop trigger if exists protect_booked_event on public.events;
create trigger protect_booked_event before delete on public.events for each row execute function public.protect_booked_event();

create or replace function public.protect_active_payment_holds() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.date is distinct from old.date and exists (select 1 from public.registrations where event_id=old.id and status='Pending' and transaction_id='AWAITING-UPI' and payment_hold_expires_at > clock_timestamp()) then
    raise exception 'Wait for active payment holds to expire before changing the event date';
  end if;
  return new;
end; $$;
drop trigger if exists protect_active_payment_holds on public.events;
create trigger protect_active_payment_holds before update of date on public.events for each row execute function public.protect_active_payment_holds();

-- The client must use the database clock, not the visitor's potentially wrong clock.
create or replace function public.payment_hold_seconds(p_registration_id text) returns integer
language sql volatile security definer set search_path = public as $$
  select case when r.status='Pending' and r.transaction_id='AWAITING-UPI' and r.payment_hold_expires_at is not null then greatest(0, floor(extract(epoch from (r.payment_hold_expires_at - clock_timestamp())))::integer) else 0 end
  from public.registrations r where r.id=p_registration_id and r.user_id=auth.uid();
$$;
revoke all on function public.payment_hold_seconds(text) from public;
grant execute on function public.payment_hold_seconds(text) to authenticated;
