-- ============================================================
-- MIGRACIÓN: propiedades reales (igual que hicimos con
-- vehículos) — sustituye el array local en phone_data.properties
-- por registros de verdad en el servidor.
-- ============================================================

create table if not exists public.property_registrations (
    id              uuid primary key default gen_random_uuid(),
    profile_id      uuid not null references public.profiles(id) on delete cascade,
    property_key    text not null,
    name            text not null,
    location        text,
    price_paid      integer not null default 0,
    purchased_at    timestamptz not null default now()
);

create index if not exists idx_property_reg_profile on public.property_registrations(profile_id);
alter table public.property_registrations enable row level security;

create or replace function public.dlrp_buy_property(p_token uuid, p_property_key text, p_name text, p_location text, p_price integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_from_bank integer;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if exists (select 1 from public.property_registrations where profile_id = v_profile.id and property_key = p_property_key) then
        raise exception 'You already own this property.';
    end if;
    if (coalesce(v_profile.bank,0) + coalesce(v_profile.cash,0)) < p_price then
        raise exception 'Not enough money.';
    end if;

    v_from_bank := least(coalesce(v_profile.bank,0), p_price);
    update public.profiles set
        bank = coalesce(bank,0) - v_from_bank,
        cash = coalesce(cash,0) - (p_price - v_from_bank)
    where id = v_profile.id;

    insert into public.property_registrations (profile_id, property_key, name, location, price_paid)
    values (v_profile.id, p_property_key, p_name, p_location, p_price);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_get_my_properties(p_token uuid)
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
        select coalesce(jsonb_agg(row_to_json(t) order by t."purchasedAt" desc), '[]'::jsonb)
        from (
            select id, property_key as "propertyKey", name, location, price_paid as "pricePaid", purchased_at as "purchasedAt"
            from public.property_registrations
            where profile_id = v_profile.id
        ) t
    );
end;
$$;

create or replace function public.dlrp_sell_property(p_token uuid, p_property_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_reg public.property_registrations;
    v_sell_price integer;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    select * into v_reg from public.property_registrations where id = p_property_id and profile_id = v_profile.id;
    if v_reg.id is null then raise exception 'Property not found.'; end if;

    v_sell_price := floor(v_reg.price_paid * 0.6);
    delete from public.property_registrations where id = p_property_id;
    update public.profiles set bank = coalesce(bank,0) + v_sell_price where id = v_profile.id;

    return jsonb_build_object('ok', true, 'sellPrice', v_sell_price);
end;
$$;

grant execute on function
    public.dlrp_buy_property(uuid,text,text,text,integer),
    public.dlrp_get_my_properties(uuid),
    public.dlrp_sell_property(uuid,uuid)
to anon, authenticated;