import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('SQL enforces roles, capacity, refunds, check-in, publication and verified reviews', async () => {
  const db = new PGlite();
  const one = '11111111-1111-4111-8111-111111111111', two = '22222222-2222-4222-8222-222222222222', admin = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage; create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); create table storage.objects (id uuid, bucket_id text, name text); create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$; alter table storage.objects enable row level security;`);
    const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    await db.exec(schema.split('-- Apply after migration_operations.sql. Existing submitted pending registrations')[0]);
    // The standalone upgrade should be safe to apply again after the fresh schema.
    await db.exec(await readFile(new URL('../supabase/migration_operations.sql', import.meta.url), 'utf8'));
    await db.exec(`grant usage on schema public, auth to authenticated, anon; grant select, insert, update, delete on all tables in schema public to authenticated; grant usage, select on all sequences in schema public to authenticated; insert into auth.users(id) values ('${one}'), ('${two}'), ('${admin}'); update public.profiles set role='organizer' where id='${admin}'; insert into public.events(id,title,category,date,end_date,venue,city,price,capacity,image,description) values ('test','Test','Culture',now()+interval '1 day',now()+interval '2 days','Hall','Pune',100,2,'https://example.com/a.png','Test event');`);
    const as = async (id) => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
    const insert = (id, user, amount, attendees) => `insert into public.registrations(id,user_id,event_id,name,email,phone,attendees,ticket,total,transaction_id) values ('${id}','${user}','test','Alice','a@example.com','12345678',${attendees},'general',${amount},'123456');`;
    await as(one); await db.exec(insert('GTH-1', one, 200, 2));
    assert.equal((await db.query(`select public.get_event_availability('test') n`)).rows[0].n, 0);
    await assert.rejects(db.exec(`update public.registrations set status='Confirmed',payment_status='paid' where id='GTH-1'`), /Not permitted/);
    await as(two); await assert.rejects(db.exec(insert('GTH-2', two, 100, 1)), /Not enough seats/);
    await as(one); await db.exec(`update public.registrations set status='Cancelled' where id='GTH-1'`);
    assert.equal((await db.query(`select refund_status from public.registrations where id='GTH-1'`)).rows[0].refund_status, 'review');
    assert.equal((await db.query(`select attendees from public.events where id='test'`)).rows[0].attendees, 0);
    await db.exec(insert('GTH-3', one, 100, 1)); // rebooking after cancellation
    await as(two); await db.exec(insert('GTH-2', two, 100, 1));
    await assert.rejects(db.exec(`select public.check_in_ticket('GTH-2', 'test')`), /Organizer access required/);
    await as(admin); await db.exec(`update public.registrations set status='Confirmed',payment_status='paid' where id='GTH-2'`);
    await assert.rejects(db.exec(`select public.check_in_ticket('GTH-2', 'wrong-event')`), /Ticket is invalid/);
    await db.exec(`select public.check_in_ticket('GTH-2', 'test'); select public.mark_refund_complete('GTH-1');`);
    await assert.rejects(db.exec(`select public.check_in_ticket('GTH-2', 'test')`), /already checked in/);
    await as(two); await assert.rejects(db.exec(`update public.registrations set status='Cancelled' where id='GTH-2'`), /unused registrations/);
    await assert.rejects(db.exec(`insert into public.reviews(user_id,event_id,rating) values ('${two}','test',4)`), /row-level security/);
    await as(one); await db.exec(`insert into public.event_host_requests(id,user_id,contact_name,contact_email,contact_phone,title,category,event_date,city,venue,details) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${one}','Alice','a@example.com','12345678','Art Meet','Culture',now()+interval '2 days','Pune','Hall','A nice community event');`);
    await assert.rejects(db.exec(`select public.review_host_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Approved')`), /Organizer access required/);
    await as(admin); await db.exec(`select public.review_host_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Approved'); select public.publish_host_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',100,50,'https://example.com/a.png');`);
    await assert.rejects(db.exec(`select public.publish_host_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',100,50,'https://example.com/a.png')`), /cannot be published/);
    await db.exec(`reset role; update public.events set date=now()-interval '2 days',end_date=now()-interval '1 day' where id='test'`);
    await as(two); await db.exec(`insert into public.reviews(user_id,event_id,rating) values ('${two}','test',4)`);
    const rating = (await db.query(`select rating, review_count from public.events where id='test'`)).rows[0];
    assert.equal(Number(rating.rating), 4); assert.equal(rating.review_count, 1);
  } finally { await db.close(); }
});
