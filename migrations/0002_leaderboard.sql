-- Hall board: public callsigns and shift results.
-- Writes are scoped to the signed-in user. Reads return callsigns and totals only.

create table if not exists profiles (
  user_id text primary key,
  username text not null,
  username_key text not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_key_idx on profiles (username_key);

create table if not exists runs (
  id bigserial primary key,
  user_id text not null references profiles (user_id),
  kind text not null,
  seconds double precision,
  client_token text not null,
  created_at timestamptz not null default now(),
  constraint runs_kind_chk check (kind in ('fix', 'chaos'))
);

create unique index if not exists runs_user_token_idx on runs (user_id, client_token);
create index if not exists runs_user_kind_created_idx on runs (user_id, kind, created_at desc);
