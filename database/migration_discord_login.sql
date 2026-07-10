-- ============================================================
-- MIGRACIÓN: añadir login con Discord + quitar Jobs/Whitelist
-- ------------------------------------------------------------
-- Ejecuta esto en Supabase (SQL Editor -> New query -> Run) si
-- YA habías aplicado schema.sql antes. Si es una base de datos
-- nueva, no hace falta: usa directamente el schema.sql actualizado.
-- ============================================================

-- 1) Los logins de whitelist (rp_name + password) ya no son
--    obligatorios, porque ahora se inicia sesión con Discord.
alter table public.profiles alter column rp_name drop not null;
alter table public.profiles alter column password_hash drop not null;

-- 2) Identidad de Discord
alter table public.profiles add column if not exists discord_id text unique;
alter table public.profiles add column if not exists discord_username text;
alter table public.profiles add column if not exists discord_avatar text;
alter table public.profiles add column if not exists discord_in_guild boolean not null default false;

-- 3) Actualiza la función que arma el perfil en JSON para incluir Discord
create or replace function public._dlrp_profile_json(p public.profiles)
returns jsonb
language sql
stable
as $$
    select jsonb_build_object(
        'rpName', p.rp_name,
        'discordId', p.discord_id,
        'discordUsername', p.discord_username,
        'discordAvatar', p.discord_avatar,
        'discordInGuild', p.discord_in_guild,
        'discordUser', p.discord_user,
        'psn', p.psn,
        'story', p.story,
        'extraInfo', p.extra_info,
        'status', p.status,
        'job', p.job,
        'bank', p.bank,
        'cash', p.cash,
        'theme', p.theme,
        'musicFavorites', p.music_favorites,
        'phoneOwned', p.phone_owned,
        'phoneNumber', p.phone_number,
        'phoneData', p.phone_data
    );
$$;

-- Nota: las funciones de Jobs/Whitelist (dlrp_whitelist_signup,
-- dlrp_apply_job, dlrp_get_job_people...) se dejan tal cual en la
-- base de datos por si las quieres reactivar más adelante; ya no
-- se llaman desde la landing, pero no molestan estando ahí.