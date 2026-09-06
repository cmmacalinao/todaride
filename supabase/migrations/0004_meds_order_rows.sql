-- Food / vendor / pharmacy orders get their own rows.
--
-- Until now a MedsOrder lived inside the app_state blob. An order is placed
-- on the customer's phone and accepted on the vendor's, and while both
-- devices saved the whole blob, whichever saved last decided whether the
-- order existed: on 2026-09-06 a vendor's phone saving its copy a moment
-- after a customer's order landed simply erased it. Same fix rides, drivers
-- and passengers already had (0002, 0003): one row per order, upserted by
-- id, which nobody else's unrelated save can remove.
--
-- The app tolerates this table not existing yet (see HOT / missingTables in
-- src/lib/persistence.ts) — orders stay in the blob until it does — so this
-- can be run at any time: Supabase dashboard -> SQL Editor -> paste -> Run.

create table if not exists meds_order (
  id text primary key,
  customer_id text,
  pharmacy_id text,
  status text not null,
  requested_at timestamptz not null default now(),
  -- The whole MedsOrder object; the columns above are duplicated out of it
  -- only so the database can index and filter on them. The app reads this.
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists meds_order_status_idx on meds_order (status);
create index if not exists meds_order_pharmacy_idx on meds_order (pharmacy_id, requested_at desc);
create index if not exists meds_order_customer_idx on meds_order (customer_id, requested_at desc);

alter publication supabase_realtime add table meds_order;

-- Same pilot-only open policy as the other tables (see the note in 0002).
alter table meds_order enable row level security;
create policy "pilot open access" on meds_order for all using (true) with check (true);

drop trigger if exists meds_order_touch on meds_order;
create trigger meds_order_touch before update on meds_order
  for each row execute function touch_updated_at();

-- Carry over whatever orders the blob holds right now, so nothing in flight
-- is lost at the moment the app switches to reading rows.
insert into meds_order (id, customer_id, pharmacy_id, status, requested_at, data)
select
  o ->> 'id',
  o ->> 'customerId',
  o ->> 'pharmacyId',
  coalesce(o ->> 'status', 'pending_confirmation'),
  coalesce((o ->> 'requestedAt')::timestamptz, now()),
  o
from app_state, jsonb_array_elements(coalesce(state -> 'medsOrders', '[]'::jsonb)) as o
where id = 'singleton'
on conflict (id) do nothing;

select count(*) as orders_now_in_rows from meds_order;
