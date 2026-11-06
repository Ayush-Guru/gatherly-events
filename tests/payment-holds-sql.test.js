import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('payment holds reserve seats, expire safely and preserve late payment reports', async () => {
  const db = new PGlite();
  const one = '11111111-1111-4111-8111-111111111111', two = '22222222-2222-4222-8222-222222222222', admin = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage; create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects (id uuid, bucket_id text, name text); create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$; alter table storage.objects enable row level security;`);
    await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migration_payment_holds.sql', import.meta.url), 'utf8')); // idempotent
    await db.exec(`grant usage on schema public,auth to authenticated,anon; grant select,insert,update,delete on all tables in schema public to authenticated; insert into auth.users(id) values ('${one}'),('${two}'),('${admin}'); update public.profiles set role='organizer' where id='${admin}'; insert into public.events(id,title,category,date,end_date,venue,city,price,capacity,image,description) values ('test','Test','Culture',now()+interval '1 day',now()+interval '2 days','Hall','Pune',100,2,'https://example.com/a.png','Test event'), ('free','Free','Culture',now()+interval '1 day',now()+interval '2 days','Hall','Pune',0,1,'https://example.com/a.png','Free event');`);
    const as = async (id) => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
    const hold = (event, attendees=1, ticket='general') => `select * from public.create_booking_hold('${event}','Alice Test','alice@example.com','1234567890',${attendees},'${ticket}')`;
    await as(one);
    await assert.rejects(db.exec(`insert into public.registrations(id,user_id,event_id,name,email,phone,attendees,ticket,total,transaction_id) values ('fake','${two}','test','Alice','a@example.com','12345678',1,'general',100,'AWAITING-UPI');`), /New registrations must start pending|row-level security/);
    const first = (await db.query(hold('test', 2, 'plus'))).rows[0];
    const seconds = (await db.query(`select public.payment_hold_seconds('${first.id}') n`)).rows[0].n; assert.ok(seconds > 0 && seconds <= 900);
    assert.equal(first.total,330); assert.equal(first.transaction_id,'AWAITING-UPI'); assert.ok(first.payment_hold_expires_at);
    assert.equal((await db.query(`select public.get_event_availability('test') n`)).rows[0].n, 0);
    await assert.rejects(db.exec(hold('test')), /already have an active/);
    await as(two); assert.equal((await db.query(`select public.payment_hold_seconds('${first.id}') n`)).rows[0].n, null); await assert.rejects(db.exec(hold('test')), /Not enough seats/);
    await assert.rejects(db.exec(`select * from public.submit_upi_reference('${first.id}','123456789')`), /not found/i);
    await as(admin);
    await assert.rejects(db.exec(`update public.registrations set status='Confirmed',payment_status='paid' where id='${first.id}'`), /Invalid registration transition/);
    await assert.rejects(db.exec(`update public.events set capacity=1 where id='test'`), /Capacity cannot/);
    await assert.rejects(db.exec(`update public.events set date=now()+interval '2 days' where id='test'`), /active payment holds/);
    await assert.rejects(db.exec(`delete from public.events where id='test'`), /booking history/);
    await as(one);
    await assert.rejects(db.exec(`select * from public.submit_upi_reference('${first.id}','FREE-EVENT')`), /valid UTR/);
    const submitted=(await db.query(`select * from public.submit_upi_reference('${first.id}','123456789')`)).rows[0];
    assert.equal(submitted.status,'Pending'); assert.equal(submitted.transaction_id,'123456789');
    assert.equal((await db.query(`select (public.submit_upi_reference('${first.id}','123456789')).id id`)).rows[0].id,first.id); // idempotent retry
    await as(admin); await db.exec(`update public.registrations set status='Confirmed',payment_status='paid' where id='${first.id}'`);
    assert.equal((await db.query(`select public.get_event_availability('test') n`)).rows[0].n, 0);
    await as(one); await db.exec(`update public.registrations set status='Cancelled' where id='${first.id}'`);
    const expired=(await db.query(hold('test'))).rows[0];
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); update public.registrations set payment_hold_expires_at=clock_timestamp()-interval '1 second' where id='${expired.id}'`);
    await as(one); assert.equal((await db.query(`select public.payment_hold_seconds('${expired.id}') n`)).rows[0].n, 0);
    await as(two); const other=(await db.query(hold('test',2))).rows[0];
    await as(one); const late=(await db.query(`select * from public.submit_upi_reference('${expired.id}','987654321')`)).rows[0];
    assert.equal(late.status,'Cancelled'); assert.equal(late.refund_status,'review');
    assert.equal((await db.query(`select public.get_event_availability('test') n`)).rows[0].n, 0);
    await as(two); await db.exec(`update public.registrations set status='Cancelled' where id='${other.id}'`);
    const released=(await db.query(`select * from public.submit_upi_reference('${other.id}','55555555')`)).rows[0];
    assert.equal(released.status,'Cancelled'); assert.equal(released.refund_status,'review');
    // Old browser tabs can still submit a UTR directly during rollout. They do
    // not gain a hold, but their request must still respect active holds.
    await as(one); await db.exec(`insert into public.registrations(id,user_id,event_id,name,email,phone,attendees,ticket,total,transaction_id) values ('legacy','${one}','test','Alice','a@example.com','12345678',1,'general',100,'123456789')`);
    assert.equal((await db.query(`select public.get_event_availability('test') n`)).rows[0].n, 1);
    await db.exec(`update public.registrations set status='Cancelled' where id='legacy'`);
    const free=(await db.query(hold('free'))).rows[0]; assert.equal(free.transaction_id,'FREE-EVENT'); assert.equal(free.payment_hold_expires_at,null);
    await as(admin); await db.exec(`update public.registrations set status='Confirmed',payment_status='paid' where id='${free.id}'`);
    await as(one); await assert.rejects(db.exec(`select * from public.create_booking_hold('test','x','bad','123',1,'general')`), /valid booking details/);
  } finally { await db.close(); }
});
