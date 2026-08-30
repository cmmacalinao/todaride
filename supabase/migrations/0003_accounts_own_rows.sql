-- Passengers and parents get their own rows.
--
-- Everything not listed in the app's HOT set lives inside app_state as one
-- jsonb blob, and every client writes that blob whole. Two devices are then
-- in a race nobody can win: a phone registers a new passenger and saves; any
-- other device still holding the older list saves a moment later and the new
-- account is gone. No error, nothing to notice, and no row left to recover.
--
-- Rides never suffered this because they are stored a row at a time and
-- upserted by id. Accounts are the one kind of record where losing a write
-- costs a real person their sign-up, so they belong in the same shape.

create table if not exists passenger (
  id text primary key,
  name text,
  phone text,
  -- The whole Passenger object. The columns above are duplicated out of it
  -- only so the database can index and filter on them; the app reads this.
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists passenger_phone_idx on passenger (phone);

create table if not exists parent (
  id text primary key,
  name text,
  phone text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists parent_phone_idx on parent (phone);

alter table passenger enable row level security;
alter table parent enable row level security;

create policy "pilot open access" on passenger for all using (true) with check (true);
create policy "pilot open access" on parent for all using (true) with check (true);

create trigger passenger_touch_updated_at
  before update on passenger
  for each row execute function touch_updated_at();

create trigger parent_touch_updated_at
  before update on parent
  for each row execute function touch_updated_at();
