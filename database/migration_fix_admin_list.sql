-- ============================================================
-- FIX: dlrp_admin_list_applications fallaba porque el ORDER BY
-- usaba el nombre de columna original (t.applied_at) en vez del
-- alias que se le da dentro de la subconsulta (t."appliedAt").
-- Ejecuta esto en Supabase para reemplazar la función.
-- ============================================================

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
                applied_at as "appliedAt"
            from public.profiles
            where discord_id is not null
              and (p_status is null or status = p_status)
        ) t
    );
end;
$$;