-- ============================================================
-- MIGRACIÓN: permisos (conducir/armas) + verificación de
-- ciudadanos para LSPD/EMS.
-- Ejecuta esto DESPUÉS de todas las migraciones anteriores.
-- ============================================================

create table if not exists public.license_requests (
    id                uuid primary key default gen_random_uuid(),
    profile_id        uuid not null references public.profiles(id) on delete cascade,
    license_type      text not null check (license_type in ('A','B','C','D','E','weapons')),
    status            text not null default 'pending' check (status in ('pending','approved','denied')),
    decided_by_username text,
    decided_at        timestamptz,
    created_at        timestamptz not null default now()
);

create index if not exists idx_license_requests_status on public.license_requests(status);
alter table public.license_requests enable row level security;

-- ---------- RPC: PERMISOS (conducir, armas) ----------

create or replace function public.dlrp_submit_license_request(p_token uuid, p_license_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if p_license_type not in ('A','B','C','D','E','weapons') then raise exception 'Invalid license type.'; end if;

    if exists (
        select 1 from public.license_requests
        where profile_id = v_profile.id and license_type = p_license_type and status = 'pending'
    ) then
        raise exception 'You already have a pending request for this license.';
    end if;

    insert into public.license_requests (profile_id, license_type)
    values (v_profile.id, p_license_type);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_get_my_licenses(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    return (
        select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        from (
            select license_type as "licenseType", status, created_at as "createdAt"
            from public.license_requests
            where profile_id = v_profile.id
            order by created_at desc
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_list_license_requests(p_token uuid, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" desc), '[]'::jsonb)
        from (
            select
                r.id, r.license_type as "licenseType", r.status,
                r.created_at as "createdAt", r.decided_by_username as "decidedByUsername",
                p.rp_name as "rpName", p.discord_username as "discordUsername", p.discord_avatar as "discordAvatar"
            from public.license_requests r
            join public.profiles p on p.id = r.profile_id
            where p_status is null or r.status = p_status
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_decide_license_request(p_token uuid, p_request_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
    v_req public.license_requests;
begin
    v_admin := public._dlrp_require_admin(p_token);
    if p_status not in ('approved', 'denied') then raise exception 'Invalid status.'; end if;

    select * into v_req from public.license_requests where id = p_request_id;
    if v_req.id is null then raise exception 'Request not found.'; end if;

    update public.license_requests set
        status = p_status,
        decided_by_username = v_admin.discord_username,
        decided_at = now()
    where id = p_request_id;

    if p_status = 'approved' then
        update public.profiles set
            phone_data = jsonb_set(
                coalesce(phone_data, '{}'::jsonb),
                array['licenses'],
                coalesce(phone_data->'licenses', '[]'::jsonb) || jsonb_build_array(
                    jsonb_build_object(
                        'type', v_req.license_type,
                        'issued', to_char(now(), 'DD/MM/YYYY'),
                        'expires', to_char(now() + interval '2 years', 'DD/MM/YYYY')
                    )
                )
            )
        where id = v_req.profile_id;
    end if;

    return jsonb_build_object('ok', true);
end;
$$;

-- Ficha de un ciudadano para verificacion en un control (LSPD/EMS).
-- Cualquier miembro del departamento puede usarla, no solo el jefe --
-- es una herramienta de trabajo del dia a dia, no de gestion.
create or replace function public.dlrp_hq_lookup_citizen(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_reports_count int;
    v_licenses jsonb;
begin
    select * into v_profile from public.profiles
    where status = 'approved'
      and (rp_name ilike '%' || p_query || '%' or psn ilike '%' || p_query || '%')
    order by rp_name
    limit 1;

    if v_profile.id is null then
        return jsonb_build_object('found', false);
    end if;

    select count(*) into v_reports_count from public.reports where reported_name ilike v_profile.rp_name;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'type', lic->>'type',
            'issued', lic->>'issued',
            'expires', lic->>'expires',
            'valid', (to_date(lic->>'expires', 'DD/MM/YYYY') >= current_date)
        )
    ), '[]'::jsonb) into v_licenses
    from jsonb_array_elements(coalesce(v_profile.phone_data->'licenses', '[]'::jsonb)) as lic;

    return jsonb_build_object(
        'found', true,
        'rpName', v_profile.rp_name,
        'psn', v_profile.psn,
        'isBanned', v_profile.is_banned,
        'banReason', v_profile.ban_reason,
        'reportsOnFile', v_reports_count,
        'idInfo', v_profile.phone_data->'idInfo',
        'licenses', v_licenses,
        'job', v_profile.job
    );
end;
$$;

grant execute on function
    public.dlrp_submit_license_request(uuid,text),
    public.dlrp_get_my_licenses(uuid),
    public.dlrp_admin_list_license_requests(uuid,text),
    public.dlrp_admin_decide_license_request(uuid,uuid,text)
to anon, authenticated;

grant execute on function public.dlrp_hq_lookup_citizen(text) to service_role;