-- RIS schema, including the Automated Form Heading Printer.
-- Safe to rerun in the Supabase SQL Editor on an existing RIS project.
-- The browser writes the complete medication-order array as text under
-- lghMedicationOrdersV1. Each order may contain patientHeading
-- {last,first,middle,sourceName} and kardexExtra {sex,dob} along with its
-- existing patientName, hospitalNo, age, ward and roomNumber properties.
-- The heading printer also updates lghKardexExtrasV1. Batch selection and
-- printing are transient. heading-alignment-v1-<form>-<paper> profiles are
-- saved on the device and as one row per profile in this table, so they
-- follow the account. No schema change is needed for them.
create table if not exists public.ris_user_data (
    user_id uuid not null references auth.users(id) on delete cascade,
    storage_key text not null,
    value text not null default '',
    updated_at timestamptz not null default now(),
    primary key (user_id, storage_key)
);

alter table public.ris_user_data enable row level security;

-- Explicit API permissions; RLS below still limits every row to its owner.
revoke all on table public.ris_user_data from anon;
grant select, insert, update, delete on table public.ris_user_data to authenticated;

comment on table public.ris_user_data is
  'Per-account RIS storage. Medication orders, Kardex extras and confirmed form-heading names are kept in the existing application JSON values.';
comment on column public.ris_user_data.storage_key is
  'Application key, e.g. lghMedicationOrdersV1 or lghKardexExtrasV1; form-heading alignment profiles use heading-alignment-v1-<form>-<paper>.';
comment on column public.ris_user_data.value is
  'Serialized application value. lghMedicationOrdersV1 contains the patientHeading object within each order.';

drop policy if exists "Users can read their RIS data" on public.ris_user_data;
create policy "Users can read their RIS data"
on public.ris_user_data for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their RIS data" on public.ris_user_data;
create policy "Users can insert their RIS data"
on public.ris_user_data for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their RIS data" on public.ris_user_data;
create policy "Users can update their RIS data"
on public.ris_user_data for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their RIS data" on public.ris_user_data;
create policy "Users can delete their RIS data"
on public.ris_user_data for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Include the table in Supabase Realtime so open RIS tabs refresh automatically.
do $$
begin
    alter publication supabase_realtime add table public.ris_user_data;
exception
    when duplicate_object then null;
end $$;
