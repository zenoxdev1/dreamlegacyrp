-- ============================================================
-- MIGRACIÓN: balance inicial de $10,000 al ser aprobado en la
-- whitelist (una sola vez de por vida, no cada vez que se
-- reaprueba tras salir/reentrar en Discord).
-- ============================================================

alter table public.profiles add column if not exists starter_balance_given boolean not null default false;