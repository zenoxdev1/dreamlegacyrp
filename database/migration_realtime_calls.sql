-- ============================================================
-- MIGRACIÓN: llamadas en tiempo real (timbre, contestar/rechazar)
-- Ejecuta esto DESPUÉS de todas las migraciones anteriores,
-- incluida migration_messages_calls.sql.
-- ============================================================

alter table public.call_logs add column if not exists status text not null default 'ringing' check (status in ('ringing','answered','declined','missed'));
alter table public.call_logs add column if not exists answered_at timestamptz;

create or replace function public.dlrp_get_recent_calls(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me record;
begin
    select * into v_me from public._dlrp_my_number(p_token);

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" desc), '[]'::jsonb)
        from (
            select
                from_number as "fromNumber", to_number as "toNumber",
                from_rp_name as "fromRpName", created_at as "createdAt",
                status,
                (from_number = v_me.my_number) as "outgoing"
            from public.call_logs
            where from_number = v_me.my_number or to_number = v_me.my_number
            order by created_at desc
            limit 30
        ) t
    );
end;
$$;

-- ---------- RPC: LLAMADAS EN TIEMPO REAL ----------
-- No hay audio de verdad (eso sigue siendo el chat de voz normal
-- del juego) -- esto es el "evento" de la llamada: timbre en el
-- momento, contestar/rechazar, y saber si te han cogido.

create or replace function public.dlrp_check_incoming_call(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me record;
    v_call public.call_logs;
begin
    select * into v_me from public._dlrp_my_number(p_token);

    select * into v_call from public.call_logs
    where to_number = v_me.my_number
      and status = 'ringing'
      and created_at > now() - interval '25 seconds'
    order by created_at desc
    limit 1;

    if v_call.id is null then
        return jsonb_build_object('ringing', false);
    end if;

    return jsonb_build_object(
        'ringing', true,
        'callId', v_call.id,
        'fromNumber', v_call.from_number,
        'fromRpName', v_call.from_rp_name
    );
end;
$$;

create or replace function public.dlrp_respond_call(p_token uuid, p_call_id uuid, p_answer boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me record;
begin
    select * into v_me from public._dlrp_my_number(p_token);

    update public.call_logs set
        status = case when p_answer then 'answered' else 'declined' end,
        answered_at = case when p_answer then now() else null end
    where id = p_call_id and to_number = v_me.my_number and status = 'ringing';

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_get_call_outcome(p_token uuid, p_call_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me record;
    v_call public.call_logs;
begin
    select * into v_me from public._dlrp_my_number(p_token);

    select * into v_call from public.call_logs
    where id = p_call_id and from_number = v_me.my_number;

    if v_call.id is null then
        return jsonb_build_object('status', 'unknown');
    end if;

    -- Si lleva mas de 25 segundos sonando sin respuesta, se cuenta
    -- como perdida (nadie la contesto a tiempo).
    if v_call.status = 'ringing' and v_call.created_at < now() - interval '25 seconds' then
        update public.call_logs set status = 'missed' where id = v_call.id;
        return jsonb_build_object('status', 'missed');
    end if;

    return jsonb_build_object('status', v_call.status);
end;
$$;

grant execute on function
    public.dlrp_check_incoming_call(uuid),
    public.dlrp_respond_call(uuid,uuid,boolean),
    public.dlrp_get_call_outcome(uuid,uuid)
to anon, authenticated;

-- Ademas, dlrp_place_call ahora devuelve el ID de la llamada para
-- que quien llama pueda comprobar si se la han cogido.
create or replace function public.dlrp_place_call(p_token uuid, p_to_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me record;
    v_call public.call_logs;
begin
    select * into v_me from public._dlrp_my_number(p_token);
    if p_to_number is null or length(trim(p_to_number)) = 0 then raise exception 'Number is required.'; end if;
    if not exists (select 1 from public.profiles where phone_number = p_to_number) then
        raise exception 'That phone number doesn''t exist.';
    end if;

    insert into public.call_logs (from_number, to_number, from_rp_name)
    values (v_me.my_number, p_to_number, v_me.my_rp_name)
    returning * into v_call;

    return jsonb_build_object('ok', true, 'callId', v_call.id);
end;
$$;