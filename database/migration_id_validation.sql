-- ============================================================
-- MIGRACIÓN: validación real de fecha de nacimiento + fecha de
-- expedición/caducidad en el DNI aprobado.
-- Ejecuta esto DESPUÉS de migration_id_requests.sql.
-- ============================================================

create or replace function public.dlrp_submit_id_request(p_token uuid, p_full_name text, p_dob text, p_pob text, p_gender text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_dob_date date;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if p_full_name is null or length(trim(p_full_name)) = 0 then raise exception 'Full name is required.'; end if;
    if position(' ' in trim(p_full_name)) = 0 then raise exception 'Enter your full name (first and last name).'; end if;
    if p_dob is null or length(trim(p_dob)) = 0 then raise exception 'Date of birth is required.'; end if;

    begin
        v_dob_date := to_date(p_dob, 'DD/MM/YYYY');
    exception when others then
        raise exception 'That is not a valid date.';
    end;
    if v_dob_date > current_date then raise exception 'Date of birth cannot be in the future.'; end if;
    if v_dob_date < current_date - interval '100 years' then raise exception 'That date of birth looks too far in the past.'; end if;
    if v_dob_date > current_date - interval '16 years' then raise exception 'Your character must be at least 16 years old.'; end if;

    if exists (select 1 from public.id_requests where profile_id = v_profile.id and status = 'pending') then
        raise exception 'You already have a pending ID request.';
    end if;

    insert into public.id_requests (profile_id, full_name, dob, pob, gender)
    values (v_profile.id, p_full_name, p_dob, p_pob, p_gender);

    return jsonb_build_object('ok', true);
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
                    'idNum', v_id_number,
                    'issued', to_char(now(), 'DD/MM/YYYY'),
                    'expires', to_char(now() + interval '4 years', 'DD/MM/YYYY')
                )
            )
        where id = v_request.profile_id;
    end if;

    return jsonb_build_object('ok', true, 'idNumber', v_id_number);
end;
$$;