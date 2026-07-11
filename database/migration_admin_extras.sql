-- ============================================================
-- MIGRACIÓN: motivo al rechazar + quién decidió cada solicitud
-- Ejecuta esto en Supabase DESPUÉS de las migraciones anteriores.
-- ============================================================

alter table public.profiles add column if not exists decided_by_discord_id text;
alter table public.profiles add column if not exists decided_by_username text;
alter table public.profiles add column if not exists decided_at timestamptz;
alter table public.profiles add column if not exists deny_reason text;

-- Perfil del propio jugador: ahora incluye el motivo de rechazo si lo hay.
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
        'denyReason', p.deny_reason,
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

create or replace function public.dlrp_admin_list_applications(p_token uuid, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."appliedAt" desc nulls last), '[]'::jsonb)
        from (
            select
                id,
                rp_name as "rpName",
                discord_id as "discordId",
                discord_username as "discordUsername",
                discord_avatar as "discordAvatar",
                discord_in_guild as "discordInGuild",
                psn,
                story,
                extra_info as "extraInfo",
                status,
                applied_at as "appliedAt",
                decided_by_username as "decidedByUsername",
                decided_at as "decidedAt",
                deny_reason as "denyReason"
            from public.profiles
            where discord_id is not null
              and (p_status is null or status = p_status)
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_set_status(p_token uuid, p_profile_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
begin
    v_admin := public._dlrp_require_admin(p_token);

    if p_status not in ('pending', 'approved', 'denied') then
        raise exception 'Invalid status.';
    end if;

    update public.profiles set
        status = p_status,
        decided_by_discord_id = v_admin.discord_id,
        decided_by_username = v_admin.discord_username,
        decided_at = now(),
        deny_reason = case when p_status = 'denied' then p_reason else null end
    where id = p_profile_id;

    if not found then
        raise exception 'Application not found.';
    end if;

    -- El envío del DM (aprobado/rechazado) lo dispara automáticamente
    -- el Database Webhook configurado sobre esta tabla, al detectar
    -- el cambio de status -- no hace falta duplicarlo aquí.
    return jsonb_build_object('ok', true, 'decidedBy', v_admin.discord_username);
end;
$$;

grant execute on function
    public.dlrp_admin_set_status(uuid,uuid,text,text)
to anon, authenticated;