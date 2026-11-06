import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// An optional real PostgreSQL test: provide a local Unix socket for an isolated
// throwaway cluster; the regular PGlite suite still runs without PostgreSQL.
const socket = process.env.GATHERLY_TEST_PG_SOCKET;
const port = Number(process.env.GATHERLY_TEST_PG_PORT || 55432);
const one = '11111111-1111-4111-8111-111111111111', two = '22222222-2222-4222-8222-222222222222';

test('PostgreSQL serializes last-seat holds and late UTR recovery', { skip: !socket }, async () => {
  assert.ok(socket.startsWith('/tmp/'), 'only use a disposable local Unix socket under /tmp');
  const database = `gatherly_test_${randomBytes(8).toString('hex')}`;
  const options = { host: socket, port, user: process.env.USER || 'user' };
  const admin = new pg.Client({ ...options, database: 'postgres' });
  let setup, a, b;
  await admin.connect();
  try {
    await admin.query(`create database ${database}`);
    setup = new pg.Client({ ...options, database }); await setup.connect();
    await setup.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
      create schema auth; create schema storage; create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid, bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
      alter table storage.objects enable row level security;`);
    await setup.query(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    await setup.query(`grant usage on schema public,auth to authenticated,anon; grant select,insert,update,delete on all tables in schema public to authenticated;
      insert into auth.users(id) values ('${one}'), ('${two}');
      insert into public.events(id,title,category,date,end_date,venue,city,price,capacity,image,description) values ('race','Race','Culture',now()+interval '1 day',now()+interval '2 days','Hall','Pune',100,1,'https://example.com/a.png','Race event');`);
    a = new pg.Client({ ...options, database }); b = new pg.Client({ ...options, database }); await Promise.all([a.connect(), b.connect()]);
    await Promise.all([a.query("set statement_timeout = '5s'"), b.query("set statement_timeout = '5s'")]);
    const authenticate = async (client, id) => { await client.query('begin'); await client.query('set local role authenticated'); await client.query("select set_config('request.jwt.claim.sub', $1, true)", [id]); };
    const reserve = (client) => client.query("select * from public.create_booking_hold('race','Alice Test','alice@example.com','1234567890',1,'general')");
    await Promise.all([authenticate(a, one), authenticate(b, two)]);
    const first = (await reserve(a)).rows[0];
    let settled = false;
    const competing = reserve(b).then(value => { settled = true; return {value}; }, error => { settled = true; return {error}; });
    await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(settled, false, 'competing hold should wait for the event lock');
    await a.query('commit');
    const second = await competing; assert.match(second.error?.message || '', /Not enough seats/); await b.query('rollback');
    assert.equal((await setup.query("select public.get_event_availability('race') as remaining")).rows[0].remaining, 0);
    await setup.query("update public.registrations set payment_hold_expires_at=clock_timestamp()-interval '1 second' where id=$1", [first.id]);
    await Promise.all([authenticate(a, one), authenticate(b, two)]);
    // Each transaction commits independently; both contend for the event lock.
    const latePromise = a.query('select * from public.submit_upi_reference($1,$2)', [first.id, '123456789']).then(async result => { await a.query('commit'); return result; });
    const replacementPromise = reserve(b).then(async result => { await b.query('commit'); return result; });
    const [late, replacement] = await Promise.all([latePromise, replacementPromise]);
    assert.equal(late.rows[0].status, 'Cancelled'); assert.equal(late.rows[0].refund_status, 'review'); assert.equal(replacement.rows[0].status, 'Pending');
    const final = (await setup.query("select public.get_event_availability('race') as remaining, (select count(*) from public.registrations where event_id='race' and status='Pending') as pending")).rows[0];
    assert.equal(final.remaining, 0); assert.equal(Number(final.pending), 1);
  } finally {
    await Promise.allSettled([a?.end(), b?.end(), setup?.end()].filter(Boolean));
    await admin.query(`drop database if exists ${database}`); await admin.end();
  }
});
