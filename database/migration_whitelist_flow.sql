-- ============================================================
-- MIGRACIÓN: flujo de solicitud (whitelist) + Discord DMs
-- Ejecuta esto en Supabase DESPUÉS de migration_discord_login.sql
-- si tu base de datos ya existía antes de este cambio.
-- ============================================================

alter table public.profiles add column if not exists applied_at timestamptz;

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
        'appliedAt', p.applied_at,
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