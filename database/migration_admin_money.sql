-- ============================================================
-- MIGRACIÓN: dar dinero desde el panel de administración
-- ============================================================

create or replace function public.dlrp_admin_set_money(p_token uuid, p_profile_id uuid, p_bank integer, p_cash integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
    v_target public.profiles;
begin
    v_admin := public._dlrp_require_admin(p_token);

    update public.profiles set
        bank = greatest(coalesce(p_bank, bank), 0),
        cash = greatest(coalesce(p_cash, cash), 0)
    where id = p_profile_id
    returning * into v_target;

    if not found then
        raise exception 'Player not found.';
    end if;

    return jsonb_build_object('ok', true, 'bank', v_target.bank, 'cash', v_target.cash);
end;
$$;

grant execute on function public.dlrp_admin_set_money(uuid,uuid,integer,integer) to anon, authenticated;

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
                deny_reason as "denyReason",
                bank,
                cash
            from public.profiles
            where discord_id is not null
              and (p_status is null or status = p_status)
        ) t
    );
end;
$$;