-- ============================================================
-- MIGRACIÓN: solicitudes de empleo con aprobación del admin
-- Ejecuta esto DESPUÉS de todas las migraciones anteriores.
-- ============================================================

create table if not exists public.job_applications (
    id                uuid primary key default gen_random_uuid(),
    profile_id        uuid not null references public.profiles(id) on delete cascade,
    job_name          text not null,
    status            text not null default 'pending' check (status in ('pending','approved','denied')),
    decided_by_username text,
    decided_at        timestamptz,
    created_at        timestamptz not null default now()
);

create index if not exists idx_job_apps_status on public.job_applications(status);
alter table public.job_applications enable row level security;

-- ---------- RPC: SOLICITUDES DE EMPLEO ----------

create or replace function public.dlrp_apply_job_v2(p_token uuid, p_job_name text)
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
    if v_profile.job is not null and v_profile.job <> '' then raise exception 'You already have a job. Quit it first.'; end if;
    if exists (select 1 from public.job_applications where profile_id = v_profile.id and status = 'pending') then
        raise exception 'You already have a pending job application.';
    end if;

    insert into public.job_applications (profile_id, job_name)
    values (v_profile.id, p_job_name);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_get_job_application_status(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_app public.job_applications;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    select * into v_app from public.job_applications
    where profile_id = v_profile.id
    order by created_at desc
    limit 1;

    if v_app.id is null then
        return jsonb_build_object('status', 'none');
    end if;

    return jsonb_build_object('status', v_app.status, 'jobName', v_app.job_name);
end;
$$;

create or replace function public.dlrp_quit_job(p_token uuid)
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

    update public.profiles set job = null where id = v_profile.id;
    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_admin_list_job_applications(p_token uuid, p_status text default null)
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
                a.id, a.job_name as "jobName", a.status,
                a.created_at as "createdAt", a.decided_by_username as "decidedByUsername",
                p.rp_name as "rpName", p.discord_username as "discordUsername", p.discord_avatar as "discordAvatar"
            from public.job_applications a
            join public.profiles p on p.id = a.profile_id
            where p_status is null or a.status = p_status
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_decide_job_application(p_token uuid, p_application_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
    v_app public.job_applications;
begin
    v_admin := public._dlrp_require_admin(p_token);
    if p_status not in ('approved', 'denied') then raise exception 'Invalid status.'; end if;

    select * into v_app from public.job_applications where id = p_application_id;
    if v_app.id is null then raise exception 'Application not found.'; end if;

    update public.job_applications set
        status = p_status,
        decided_by_username = v_admin.discord_username,
        decided_at = now()
    where id = p_application_id;

    if p_status = 'approved' then
        update public.profiles set job = v_app.job_name where id = v_app.profile_id;
    end if;

    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function
    public.dlrp_apply_job_v2(uuid,text),
    public.dlrp_get_job_application_status(uuid),
    public.dlrp_quit_job(uuid),
    public.dlrp_admin_list_job_applications(uuid,text),
    public.dlrp_admin_decide_job_application(uuid,uuid,text)
to anon, authenticated;