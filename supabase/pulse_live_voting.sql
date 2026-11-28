-- Peak Season Pulse: live voting for the Finance Operations all-hands (Supabase / Postgres).
-- Applied to the Supabase project as migration "pulse_live_voting".
-- Everyone may read the shared screen state and the anonymous answers.
-- Writes only go through two checked functions: phones submit answers, and only
-- the presenter (who knows the presenter key) can change the screen state.
-- To set or change the presenter key, store the SHA-256 hex digest of the new key in pulse_secrets
-- (the last insert below). Never commit the key or its digest.

create table if not exists public.pulse_state (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pulse_votes (
  token text primary key,
  epoch text not null,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists pulse_votes_epoch_idx on public.pulse_votes (epoch);

create table if not exists public.pulse_secrets (
  id int primary key default 1 check (id = 1),
  key_hash text not null
);

alter table public.pulse_state enable row level security;
alter table public.pulse_votes enable row level security;
alter table public.pulse_secrets enable row level security;

revoke all on public.pulse_state, public.pulse_votes, public.pulse_secrets from anon, authenticated;
grant select on public.pulse_state, public.pulse_votes to anon, authenticated;

create policy "pulse_state is readable" on public.pulse_state for select to anon, authenticated using (true);
create policy "pulse_votes are readable" on public.pulse_votes for select to anon, authenticated using (true);
-- pulse_secrets has no policies and no grants, so it cannot be read through the API.

create or replace function public.pulse_vote(p_token text, p_epoch text, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{6,64}$' then raise exception 'invalid token'; end if;
  if p_epoch is null or length(p_epoch) > 40 then raise exception 'invalid epoch'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 4000 then raise exception 'invalid answers'; end if;
  insert into pulse_votes (token, epoch, answers, updated_at)
  values (p_token, p_epoch, p_answers, now())
  on conflict (token) do update set epoch = excluded.epoch, answers = excluded.answers, updated_at = now();
end;
$$;

create or replace function public.pulse_set_state(p_key text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from pulse_secrets
    where id = 1 and key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
  ) then
    raise exception 'wrong presenter key' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or length(p_data::text) > 20000 then raise exception 'invalid state'; end if;
  insert into pulse_state (id, data, updated_at) values ('main', p_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
  -- A reset starts a new epoch: answers from earlier runs are removed.
  delete from pulse_votes where epoch is distinct from (p_data->>'epoch');
end;
$$;

revoke all on function public.pulse_vote(text, text, jsonb) from public;
revoke all on function public.pulse_set_state(text, jsonb) from public;
grant execute on function public.pulse_vote(text, text, jsonb) to anon, authenticated;
grant execute on function public.pulse_set_state(text, jsonb) to anon, authenticated;

insert into public.pulse_secrets (id, key_hash)
values (1, '<sha256 hex of your presenter key>')
on conflict (id) do update set key_hash = excluded.key_hash;

insert into public.pulse_state (id, data)
values ('main', '{"current":0,"revealedQ":{},"timerEnd":0,"hidden":[],"epoch":"e1","cleared":{},"rev":0}'::jsonb)
on conflict (id) do nothing;

alter publication supabase_realtime add table public.pulse_state, public.pulse_votes;
