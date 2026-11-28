-- Peak Season Pulse: private content (applied as migration "pulse_private_content").
-- The public website holds only the app. The presentation content lives here:
--   pulse_content 'full'   everything, readable only with the presenter key  (rpc pulse_get_content)
--   pulse_content 'phone'  the poll questions, readable with the join code from the QR code (rpc pulse_get_phone)
-- Upload with `npm run content:push` (rpc pulse_set_content, needs the presenter key).
-- The table has no policies and no grants: it cannot be read through the API, only through these functions.

create table if not exists public.pulse_content (
  id text primary key check (id in ('full', 'phone')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.pulse_content enable row level security;
revoke all on public.pulse_content from anon, authenticated;

alter table public.pulse_secrets add column if not exists join_hash text;

create or replace function public.pulse_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from pulse_secrets
    where id = 1 and key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
  );
$$;
revoke all on function public.pulse_key_ok(text) from public, anon, authenticated;

create or replace function public.pulse_get_content(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not pulse_key_ok(p_key) then raise exception 'wrong presenter key' using errcode = '42501'; end if;
  return (select data from pulse_content where id = 'full');
end;
$$;

create or replace function public.pulse_get_phone(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_code is null or length(p_code) > 64 or not exists (
    select 1 from pulse_secrets
    where id = 1 and join_hash = encode(extensions.digest(p_code, 'sha256'), 'hex')
  ) then
    raise exception 'wrong join code' using errcode = '42501';
  end if;
  return (select data from pulse_content where id = 'phone');
end;
$$;

create or replace function public.pulse_set_content(p_key text, p_full jsonb, p_phone jsonb, p_join_hash text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not pulse_key_ok(p_key) then raise exception 'wrong presenter key' using errcode = '42501'; end if;
  if p_full is null or jsonb_typeof(p_full) <> 'object' or length(p_full::text) > 1000000 then raise exception 'invalid content'; end if;
  if p_phone is null or jsonb_typeof(p_phone) <> 'object' or length(p_phone::text) > 200000 then raise exception 'invalid content'; end if;
  if p_join_hash is null or p_join_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid join code'; end if;
  insert into pulse_content (id, data, updated_at) values ('full', p_full, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
  insert into pulse_content (id, data, updated_at) values ('phone', p_phone, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
  update pulse_secrets set join_hash = p_join_hash where id = 1;
end;
$$;

revoke all on function public.pulse_get_content(text) from public;
revoke all on function public.pulse_get_phone(text) from public;
revoke all on function public.pulse_set_content(text, jsonb, jsonb, text) from public;
grant execute on function public.pulse_get_content(text) to anon, authenticated;
grant execute on function public.pulse_get_phone(text) to anon, authenticated;
grant execute on function public.pulse_set_content(text, jsonb, jsonb, text) to anon, authenticated;
