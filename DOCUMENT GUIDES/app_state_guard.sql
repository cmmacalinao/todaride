-- TODA SafeRide — refuse app_state writes from stale app builds.
--
-- Every build from 2026-09-06 stamps `schemaVersion` into the app_state blob
-- (see STATE_SCHEMA_VERSION in src/context/RideContext.tsx). Older builds —
-- including the copy cached on phones under the suspended todasaferide.com
-- domain — do not, and some of them push whatever they hold on launch,
-- which is how the live data was overwritten twice today. This trigger
-- turns such a write into an error the old app just logs and moves past.
--
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- To lock out a newer build later, raise STATE_SCHEMA_VERSION in the app,
-- deploy, then raise the number below to match.

create or replace function public.reject_stale_app_state()
returns trigger
language plpgsql
as $$
begin
  if coalesce((new.state ->> 'schemaVersion')::int, 0) < 2 then
    raise exception 'TODA SafeRide: this app build is out of date and may not overwrite the shared state (schemaVersion % < 2)',
      coalesce(new.state ->> 'schemaVersion', 'none');
  end if;
  return new;
end;
$$;

drop trigger if exists app_state_reject_stale on public.app_state;

create trigger app_state_reject_stale
  before insert or update on public.app_state
  for each row
  execute function public.reject_stale_app_state();

-- Check: this should return the current stamp (2) once a new build has saved.
select id, updated_by, updated_at, state ->> 'schemaVersion' as schema_version
from public.app_state;
