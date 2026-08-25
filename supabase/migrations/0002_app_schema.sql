-- TODA SafeRide — the schema the app actually runs on.
--
-- Supersedes 0001_init.sql, which was a design draft written before the app
-- existed and no longer matches it (it has no TODA organisations, terminals,
-- operators or franchises, and models users as one uuid table). 0001 was
-- never applied to a live project. Run THIS file, not that one.
--
-- Shape, and why:
--
--   Three tables hold the things two phones fight over — rides, drivers and
--   SOS alerts. Those are written from both sides constantly (a driver goes
--   online while a passenger books; a trip advances while an admin watches),
--   so each row is written on its own. A booking must never be lost because
--   someone else saved at the same moment, and an SOS least of all.
--
--   Everything else — settings, tariffs, TODA orgs, terminals, boundaries,
--   campaigns, ads — lives in one JSONB row. It is written almost entirely by
--   admins, one at a time, and splitting forty rarely-touched collections
--   into forty tables would buy nothing but migrations.
--
-- Ids are the app's own strings ('drv-uts-01', 'ride-1787…'), not uuids: they
-- are already generated, already referenced across the state tree, and
-- rewriting them would mean rewriting every seed and every stored install.

create table if not exists app_state (
  id text primary key default 'singleton',
  -- Every collection that is not one of the tables below.
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- Which browser wrote it. A client can then ignore the echo of its own
  -- write instead of re-rendering on it.
  updated_by text
);

create table if not exists ride (
  id text primary key,
  passenger_id text,
  driver_id text,
  status text not null,
  requested_at timestamptz not null default now(),
  -- The whole Ride object. The columns above are duplicated out of it only
  -- so the database can index and filter on them; the app reads this.
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists ride_status_idx on ride (status);
create index if not exists ride_driver_idx on ride (driver_id);
create index if not exists ride_passenger_idx on ride (passenger_id);
create index if not exists ride_requested_at_idx on ride (requested_at desc);

create table if not exists driver (
  id text primary key,
  toda_org_id text,
  online boolean not null default false,
  -- Null when not in the queue. Kept as a column because the Pila is ordered
  -- by it and read constantly.
  queue_joined_at timestamptz,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists driver_org_idx on driver (toda_org_id);
create index if not exists driver_queue_idx on driver (toda_org_id, queue_joined_at);

create table if not exists sos_alert (
  id text primary key,
  ride_id text,
  triggered_by text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists sos_alert_status_idx on sos_alert (status, created_at desc);

-- Realtime: the app subscribes to these and applies changes as they land,
-- which is what replaces the single-browser `storage` event it used before.
alter publication supabase_realtime add table app_state;
alter publication supabase_realtime add table ride;
alter publication supabase_realtime add table driver;
alter publication supabase_realtime add table sos_alert;

-- Row Level Security.
--
-- The pilot runs on the anon key with no Supabase Auth behind it — accounts
-- are the app's own, and adding real auth is a separate piece of work. So
-- these policies are permissive ON PURPOSE, and this is the single biggest
-- thing to fix before the app is public: anyone with the anon key (which
-- ships in the bundle, by design) can read and write every row.
--
-- Acceptable for a supervised pilot with known drivers on a private link.
-- Not acceptable once the app is listed anywhere.
alter table app_state enable row level security;
alter table ride enable row level security;
alter table driver enable row level security;
alter table sos_alert enable row level security;

create policy "pilot open access" on app_state for all using (true) with check (true);
create policy "pilot open access" on ride for all using (true) with check (true);
create policy "pilot open access" on driver for all using (true) with check (true);
create policy "pilot open access" on sos_alert for all using (true) with check (true);

-- Touch updated_at on every write so a client can tell newer from older
-- without trusting its own clock.
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger app_state_touch before update on app_state
  for each row execute function touch_updated_at();
create trigger ride_touch before update on ride
  for each row execute function touch_updated_at();
create trigger driver_touch before update on driver
  for each row execute function touch_updated_at();
create trigger sos_alert_touch before update on sos_alert
  for each row execute function touch_updated_at();
