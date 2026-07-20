-- ============================================================
-- MIGRACIÓN: Government ID pendiente de aprobación en el admin
-- Ejecuta esto DESPUÉS de todas las migraciones anteriores.
-- ============================================================

create table if not exists public.id_requests (
    id                uuid primary key default gen_random_uuid(),
    profile_id        uuid not null references public.profiles(id) on delete cascade,
    full_name         text not null,
    dob               text not null,
    pob               text,
    gender            text,
    status            text not null default 'pending' check (status in ('pending','approved','denied')),
    id_number         text,
    decided_by_username text,
    decided_at        timestamptz,
    created_at        timestamptz not null default now()
);

create index if not exists idx_id_requests_status on public.id_requests(status);
alter table public.id_requests enable row level security;

-- ---------- RPC: DNI / GOVERNMENT ID ----------

create or replace function public.dlrp_submit_id_request(p_token uuid, p_full_name text, p_dob text, p_pob text, p_gender text)
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
    if p_full_name is null or length(trim(p_full_name)) = 0 then raise exception 'Full name is required.'; end if;
    if p_dob is null or length(trim(p_dob)) = 0 then raise exception 'Date of birth is required.'; end if;

    if exists (select 1 from public.id_requests where profile_id = v_profile.id and status = 'pending') then
        raise exception 'You already have a pending ID request.';
    end if;

    insert into public.id_requests (profile_id, full_name, dob, pob, gender)
    values (v_profile.id, p_full_name, p_dob, p_pob, p_gender);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_get_id_status(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_request public.id_requests;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    select * into v_request from public.id_requests
    where profile_id = v_profile.id
    order by created_at desc
    limit 1;

    if v_request.id is null then
        return jsonb_build_object('status', 'none');
    end if;

    return jsonb_build_object(
        'status', v_request.status,
        'fullName', v_request.full_name,
        'dob', v_request.dob,
        'pob', v_request.pob,
        'gender', v_request.gender,
        'idNumber', v_request.id_number
    );
end;
$$;

create or replace function public.dlrp_admin_list_id_requests(p_token uuid, p_status text default null)
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
                r.id, r.full_name as "fullName", r.dob, r.pob, r.gender, r.status,
                r.created_at as "createdAt", r.decided_by_username as "decidedByUsername",
                p.rp_name as "rpName", p.discord_username as "discordUsername", p.discord_avatar as "discordAvatar",
                p.psn
            from public.id_requests r
            join public.profiles p on p.id = r.profile_id
            where p_status is null or r.status = p_status
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_decide_id_request(p_token uuid, p_request_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
    v_request public.id_requests;
    v_id_number text;
begin
    v_admin := public._dlrp_require_admin(p_token);
    if p_status not in ('approved', 'denied') then raise exception 'Invalid status.'; end if;

    select * into v_request from public.id_requests where id = p_request_id;
    if v_request.id is null then raise exception 'Request not found.'; end if;

    v_id_number := case when p_status = 'approved' then 'SA-' || lpad(floor(random() * 999999)::int::text, 6, '0') else null end;

    update public.id_requests set
        status = p_status,
        id_number = v_id_number,
        decided_by_username = v_admin.discord_username,
        decided_at = now()
    where id = p_request_id;

    if p_status = 'approved' then
        update public.profiles set
            phone_data = coalesce(phone_data, '{}'::jsonb) || jsonb_build_object(
                'idInfo', jsonb_build_object(
                    'name', v_request.full_name,
                    'dob', v_request.dob,
                    'pob', v_request.pob,
                    'gender', v_request.gender,
                    'idNum', v_id_number
                )
            )
        where id = v_request.profile_id;
    end if;

    return jsonb_build_object('ok', true, 'idNumber', v_id_number);
end;
$$;

grant execute on function
    public.dlrp_submit_id_request(uuid,text,text,text,text),
    public.dlrp_get_id_status(uuid),
    public.dlrp_admin_list_id_requests(uuid,text),
    public.dlrp_admin_decide_id_request(uuid,uuid,text)
to anon, authenticated;