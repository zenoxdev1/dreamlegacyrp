-- ============================================================
-- FIX: llamar/mandar mensaje a un numero que no existe ya no se
-- permite en silencio -- ahora el servidor lo rechaza con un
-- mensaje claro.
-- ============================================================

create or replace function public.dlrp_place_call(p_token uuid, p_to_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me record;
begin
    select * into v_me from public._dlrp_my_number(p_token);
    if p_to_number is null or length(trim(p_to_number)) = 0 then raise exception 'Number is required.'; end if;
    if not exists (select 1 from public.profiles where phone_number = p_to_number) then
        raise exception 'That phone number doesn''t exist.';
    end if;

    insert into public.call_logs (from_number, to_number, from_rp_name)
    values (v_me.my_number, p_to_number, v_me.my_rp_name);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_send_message(p_token uuid, p_to_number text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me record;
begin
    select * into v_me from public._dlrp_my_number(p_token);
    if p_body is null or length(trim(p_body)) = 0 then raise exception 'Message cannot be empty.'; end if;
    if p_to_number is null or length(trim(p_to_number)) = 0 then raise exception 'Recipient number is required.'; end if;
    if not exists (select 1 from public.profiles where phone_number = p_to_number) then
        raise exception 'That phone number doesn''t exist.';
    end if;

    insert into public.messages (from_number, to_number, from_rp_name, body)
    values (v_me.my_number, p_to_number, v_me.my_rp_name, p_body);

    return jsonb_build_object('ok', true);
end;
$$;