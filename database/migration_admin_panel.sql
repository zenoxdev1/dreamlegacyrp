-- ============================================================
-- MIGRACIÓN: panel de administración web
-- Ejecuta esto en Supabase DESPUÉS de las migraciones anteriores
-- (migration_discord_login.sql y migration_whitelist_flow.sql)
-- si tu base de datos ya existía antes de este cambio.
-- ============================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- ---------- RPC: PANEL DE ADMINISTRACIÓN ----------
-- Solo perfiles con is_admin = true (activado a mano en Table Editor)
-- pueden usar estas funciones. Todas validan el token de sesión Y el
-- flag de administrador antes de devolver o modificar nada.

create or replace function public._dlrp_require_admin(p_token uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then
        raise exception 'Session expired.';
    end if;
    if not v_profile.is_admin then
        raise exception 'Not authorized.';
    end if;
    return v_profile;
end;
$$;

create or replace function public.dlrp_admin_is(p_token uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then
        return false;
    end if;
    return coalesce(v_profile.is_admin, false);
end;
$$;

create or replace function public.dlrp_admin_stats(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select jsonb_build_object(
            'pending', count(*) filter (where status = 'pending'),
            'approved', count(*) filter (where status = 'approved'),
            'denied', count(*) filter (where status = 'denied'),
            'total', count(*),
            'inGuild', count(*) filter (where discord_in_guild)
        )
        from public.profiles
        where discord_id is not null
    );
end;
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
        select coalesce(jsonb_agg(row_to_json(t) order by t.applied_at desc nulls last), '[]'::jsonb)
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
                applied_at as "appliedAt"
            from public.profiles
            where discord_id is not null
              and (p_status is null or status = p_status)
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_set_status(p_token uuid, p_profile_id uuid, p_status text)
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

    update public.profiles set status = p_status where id = p_profile_id;

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
    public.dlrp_admin_is(uuid),
    public.dlrp_admin_stats(uuid),
    public.dlrp_admin_list_applications(uuid,text),
    public.dlrp_admin_set_status(uuid,uuid,text)
to anon, authenticated;

-- ============================================================
-- Después de ejecutar esto, hazte admin a ti mismo:
-- Table Editor -> profiles -> busca tu fila (por tu rp_name o
-- discord_username) -> columna is_admin -> ponla en true.
-- ============================================================