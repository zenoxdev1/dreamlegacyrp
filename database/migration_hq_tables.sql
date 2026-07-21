-- ============================================================
-- MIGRACIÓN: tablas para HQ (feed de emergencias, anuncios,
-- vehículos desbloqueados de pago).
-- Ejecuta esto DESPUÉS de todas las migraciones anteriores.
-- ============================================================

create table if not exists public.emergency_alerts (
    id            uuid primary key default gen_random_uuid(),
    department    text not null check (department in ('police','ems')),
    caller_name   text,
    caller_phone  text,
    location      text,
    created_at    timestamptz not null default now()
);

create index if not exists idx_emergency_alerts_dept on public.emergency_alerts(department, created_at desc);
alter table public.emergency_alerts enable row level security;

create table if not exists public.hq_announcements (
    id            uuid primary key default gen_random_uuid(),
    department    text not null,
    title         text not null,
    body          text not null,
    posted_by_username text,
    created_at    timestamptz not null default now()
);

create index if not exists idx_hq_announcements_dept on public.hq_announcements(department, created_at desc);
alter table public.hq_announcements enable row level security;

create table if not exists public.hq_vehicle_unlocks (
    id            uuid primary key default gen_random_uuid(),
    profile_id    uuid not null references public.profiles(id) on delete cascade,
    department    text not null,
    vehicle_id    text not null,
    unlocked_at   timestamptz not null default now(),
    unique(profile_id, department, vehicle_id)
);

alter table public.hq_vehicle_unlocks enable row level security;

-- NOTA: estas tablas se leen/escriben SOLO desde las Cloudflare
-- Functions de /api/hq/* usando la Service Role Key (no desde el
-- cliente con la anon key), así que no hace falta crear políticas
-- de RLS para "anon" -- de hecho es mejor que NO las tenga, para
-- que nadie pueda leerlas ni escribirlas saltándose la
-- comprobación de rol de Discord que hacen esas Functions.