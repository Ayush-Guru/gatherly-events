-- Run this only if you already ran an older version of schema.sql.
alter table public.registrations add column if not exists transaction_id text;
update public.registrations set transaction_id = coalesce(transaction_id, 'legacy-' || id) where transaction_id is null;
alter table public.registrations alter column transaction_id set default '';
alter table public.registrations alter column transaction_id set not null;
alter table public.registrations alter column status set default 'Pending';
alter table public.registrations alter column payment_status set default 'manual_pending';

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'registrations' and policyname = 'Organizers review registrations') then
    create policy "Organizers review registrations" on public.registrations for select using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'organizer')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'registrations' and policyname = 'Organizers approve registrations') then
    create policy "Organizers approve registrations" on public.registrations for update using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'organizer')));
  end if;
end $$;
