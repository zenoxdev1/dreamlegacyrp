-- ============================================================
-- MIGRACIÓN: historial de transacciones bancarias
-- Ejecuta esto DESPUÉS de todas las migraciones anteriores.
-- ============================================================

create table if not exists public.bank_transactions (
    id                uuid primary key default gen_random_uuid(),
    from_profile_id   uuid not null references public.profiles(id) on delete cascade,
    to_profile_id     uuid not null references public.profiles(id) on delete cascade,
    from_rp_name      text not null,
    to_rp_name        text not null,
    amount            integer not null,
    created_at        timestamptz not null default now()
);

create index if not exists idx_bank_tx_from on public.bank_transactions(from_profile_id, created_at desc);
create index if not exists idx_bank_tx_to on public.bank_transactions(to_profile_id, created_at desc);
alter table public.bank_transactions enable row level security;

create or replace function public.dlrp_transfer_bank(p_token uuid, p_to_rp_name text, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sender public.profiles;
    v_receiver_id uuid;
begin
    v_sender := public._dlrp_profile_from_token(p_token);
    if v_sender.id is null then raise exception 'Session expired.'; end if;
    if p_amount is null or p_amount <= 0 then raise exception 'Enter a valid amount.'; end if;
    if v_sender.rp_name = p_to_rp_name then raise exception 'Cannot transfer to yourself.'; end if;
    if v_sender.bank < p_amount then raise exception 'Not enough funds in bank.'; end if;

    select id into v_receiver_id from public.profiles where rp_name = p_to_rp_name;
    if v_receiver_id is null then raise exception 'User "%" not found.', p_to_rp_name; end if;

    update public.profiles set bank = bank - p_amount where id = v_sender.id;
    update public.profiles set bank = bank + p_amount where id = v_receiver_id;

    insert into public.bank_transactions (from_profile_id, to_profile_id, from_rp_name, to_rp_name, amount)
    values (v_sender.id, v_receiver_id, v_sender.rp_name, p_to_rp_name, p_amount);

    select * into v_sender from public.profiles where id = v_sender.id;
    return public._dlrp_profile_json(v_sender);
end;
$$;

create or replace function public.dlrp_get_bank_history(p_token uuid)
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
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" desc), '[]'::jsonb)
        from (
            select
                id, amount, created_at as "createdAt",
                (from_profile_id = v_profile.id) as outgoing,
                case when from_profile_id = v_profile.id then to_rp_name else from_rp_name end as "otherParty"
            from public.bank_transactions
            where from_profile_id = v_profile.id or to_profile_id = v_profile.id
            order by created_at desc
            limit 50
        ) t
    );
end;
$$;

grant execute on function public.dlrp_get_bank_history(uuid) to anon, authenticated;