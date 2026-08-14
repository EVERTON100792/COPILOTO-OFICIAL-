-- 007_app_storage.sql
-- Persiste chaves do frontend por usuário para sincronização entre dispositivos.

create table if not exists public.app_storage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_app_storage_user_key on public.app_storage (user_id, key);
create index if not exists idx_app_storage_user on public.app_storage (user_id);

alter table public.app_storage enable row level security;

create policy "own app_storage rows" on public.app_storage
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
