-- ============================================================
-- MIGRACIÓN: Mensajes y llamadas reales entre jugadores
-- Ejecuta esto DESPUÉS de todas las migraciones anteriores.
-- ============================================================

create table if not exists public.messages (
    id            uuid primary key default gen_random_uuid(),
    from_number   text not null,
    to_number     text not null,
    from_rp_name  text,
    body          text not null,
    created_at    timestamptz not null default now(),
    read_at       timestamptz
);

create index if not exists idx_messages_to on public.messages(to_number, created_at desc);
create index if not exists idx_messages_from on public.messages(from_number, created_at desc);
alter table public.messages enable row level security;

create table if not exists public.call_logs (
    id            uuid primary key default gen_random_uuid(),
    from_number   text not null,
    to_number     text not null,
    from_rp_name  text,
    created_at    timestamptz not null default now()
);

create index if not exists idx_calls_to on public.call_logs(to_number, created_at desc);
create index if not exists idx_calls_from on public.call_logs(from_number, created_at desc);
alter table public.call_logs enable row level security;

-- ---------- RPC: MENSAJES ----------
-- Identificados por numero de telefono (unico por jugador tras
-- comprar su telefono). Solo puede mandar/leer quien tenga uno.

create or replace function public._dlrp_my_number(p_token uuid)
returns table(profile_id uuid, my_number text, my_rp_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if v_profile.is_banned then raise exception 'Account banned.'; end if;
    if v_profile.phone_number is null then raise exception 'You need a phone number first.'; end if;
    return query select v_profile.id, v_profile.phone_number, coalesce(v_profile.rp_name, v_profile.discord_username);
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

    insert into public.messages (from_number, to_number, from_rp_name, body)
    values (v_me.my_number, p_to_number, v_me.my_rp_name, p_body);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_get_message_threads(p_token uuid)
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
        select coalesce(jsonb_agg(row_to_json(t) order by t."lastAt" desc), '[]'::jsonb)
        from (
            select
                other_number as "otherNumber",
                (array_agg(body order by created_at desc))[1] as "lastBody",
                max(created_at) as "lastAt",
                count(*) filter (where to_number = v_me.my_number and read_at is null) as "unread"
            from (
                select
                    case when from_number = v_me.my_number then to_number else from_number end as other_number,
                    from_number, to_number, body, created_at, read_at
                from public.messages
                where from_number = v_me.my_number or to_number = v_me.my_number
            ) m
            group by other_number
        ) t
    );
end;
$$;

create or replace function public.dlrp_get_thread_messages(p_token uuid, p_other_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me record;
begin
    select * into v_me from public._dlrp_my_number(p_token);

    update public.messages set read_at = now()
    where to_number = v_me.my_number and from_number = p_other_number and read_at is null;

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" asc), '[]'::jsonb)
        from (
            select
                from_number as "fromNumber", to_number as "toNumber",
                from_rp_name as "fromRpName", body, created_at as "createdAt",
                (from_number = v_me.my_number) as "isMine"
            from public.messages
            where (from_number = v_me.my_number and to_number = p_other_number)
               or (from_number = p_other_number and to_number = v_me.my_number)
        ) t
    );
end;
$$;

-- ---------- RPC: LLAMADAS (registro, sin timbre en vivo) ----------

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

    insert into public.call_logs (from_number, to_number, from_rp_name)
    values (v_me.my_number, p_to_number, v_me.my_rp_name);

    return jsonb_build_object('ok', true);
end;
$$;

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
                (from_number = v_me.my_number) as "outgoing"
            from public.call_logs
            where from_number = v_me.my_number or to_number = v_me.my_number
            order by created_at desc
            limit 30
        ) t
    );
end;
$$;

grant execute on function
    public.dlrp_send_message(uuid,text,text),
    public.dlrp_get_message_threads(uuid),
    public.dlrp_get_thread_messages(uuid,text),
    public.dlrp_place_call(uuid,text),
    public.dlrp_get_recent_calls(uuid)
to anon, authenticated;