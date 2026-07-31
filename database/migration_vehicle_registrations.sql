-- ============================================================
-- MIGRACIÓN: matriculación real de vehículos (VIN, matrícula,
-- seguro) — sustituye el array local que vivía solo en
-- phone_data.vehicles por registros de verdad en el servidor.
-- ============================================================

create table if not exists public.vehicle_registrations (
    id              uuid primary key default gen_random_uuid(),
    profile_id      uuid not null references public.profiles(id) on delete cascade,
    vin             text not null unique,
    plate           text not null unique,
    model           text not null,
    vehicle_type    text,
    color           text default 'Stock',
    price_paid      integer not null default 0,
    insured         boolean not null default false,
    insurance_expires timestamptz,
    purchased_at    timestamptz not null default now()
);

create index if not exists idx_vehicle_reg_profile on public.vehicle_registrations(profile_id);
alter table public.vehicle_registrations enable row level security;

-- ---------- RPC: VEHÍCULOS ----------

create or replace function public.dlrp_generate_vin()
returns text
language plpgsql
as $$
declare
    v_vin text;
begin
    v_vin := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 17));
    return v_vin;
end;
$$;

create or replace function public.dlrp_generate_plate()
returns text
language plpgsql
as $$
declare
    v_letters text := '';
    v_digits text := '';
    v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'; -- sin I ni O, para que no se confundan
    i int;
begin
    for i in 1..2 loop
        v_letters := v_letters || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    v_digits := lpad(floor(random() * 1000)::text, 3, '0');
    return v_letters || v_digits;
end;
$$;

create or replace function public.dlrp_buy_vehicle(p_token uuid, p_model text, p_vehicle_type text, p_price integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_vin text;
    v_plate text;
    v_from_bank integer;
    v_reg public.vehicle_registrations;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if p_price is null or p_price < 0 then raise exception 'Invalid price.'; end if;
    if (coalesce(v_profile.bank,0) + coalesce(v_profile.cash,0)) < p_price then
        raise exception 'Not enough money.';
    end if;

    -- VIN y matricula unicos de verdad, reintenta si por casualidad choca.
    loop
        v_vin := public.dlrp_generate_vin();
        exit when not exists (select 1 from public.vehicle_registrations where vin = v_vin);
    end loop;
    loop
        v_plate := public.dlrp_generate_plate();
        exit when not exists (select 1 from public.vehicle_registrations where plate = v_plate);
    end loop;

    v_from_bank := least(coalesce(v_profile.bank,0), p_price);
    update public.profiles set
        bank = coalesce(bank,0) - v_from_bank,
        cash = coalesce(cash,0) - (p_price - v_from_bank)
    where id = v_profile.id;

    insert into public.vehicle_registrations (profile_id, vin, plate, model, vehicle_type, price_paid, insured, insurance_expires)
    values (v_profile.id, v_vin, v_plate, p_model, p_vehicle_type, p_price, true, now() + interval '30 days')
    returning * into v_reg;

    return jsonb_build_object(
        'ok', true, 'vin', v_reg.vin, 'plate', v_reg.plate,
        'insuranceExpires', v_reg.insurance_expires
    );
end;
$$;

create or replace function public.dlrp_get_my_vehicles(p_token uuid)
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
            select
                id, vin, plate, model, vehicle_type as "vehicleType", color,
                price_paid as "pricePaid", insured,
                insurance_expires as "insuranceExpires",
                (insurance_expires is not null and insurance_expires > now()) as "insuranceActive",
                purchased_at as "purchasedAt"
            from public.vehicle_registrations
            where profile_id = v_profile.id
        ) t
    );
end;
$$;

create or replace function public.dlrp_sell_vehicle(p_token uuid, p_vehicle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_reg public.vehicle_registrations;
    v_sell_price integer;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    select * into v_reg from public.vehicle_registrations where id = p_vehicle_id and profile_id = v_profile.id;
    if v_reg.id is null then raise exception 'Vehicle not found.'; end if;

    v_sell_price := floor(v_reg.price_paid * 0.5);
    delete from public.vehicle_registrations where id = p_vehicle_id;
    update public.profiles set bank = coalesce(bank,0) + v_sell_price where id = v_profile.id;

    return jsonb_build_object('ok', true, 'sellPrice', v_sell_price);
end;
$$;

create or replace function public.dlrp_renew_insurance(p_token uuid, p_vehicle_id uuid, p_cost integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_reg public.vehicle_registrations;
    v_from_bank integer;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if (coalesce(v_profile.bank,0) + coalesce(v_profile.cash,0)) < p_cost then
        raise exception 'Not enough money.';
    end if;

    select * into v_reg from public.vehicle_registrations where id = p_vehicle_id and profile_id = v_profile.id;
    if v_reg.id is null then raise exception 'Vehicle not found.'; end if;

    v_from_bank := least(coalesce(v_profile.bank,0), p_cost);
    update public.profiles set
        bank = coalesce(bank,0) - v_from_bank,
        cash = coalesce(cash,0) - (p_cost - v_from_bank)
    where id = v_profile.id;

    update public.vehicle_registrations set
        insured = true,
        insurance_expires = greatest(coalesce(insurance_expires, now()), now()) + interval '30 days'
    where id = p_vehicle_id
    returning * into v_reg;

    return jsonb_build_object('ok', true, 'insuranceExpires', v_reg.insurance_expires);
end;
$$;

grant execute on function
    public.dlrp_buy_vehicle(uuid,text,text,integer),
    public.dlrp_get_my_vehicles(uuid),
    public.dlrp_sell_vehicle(uuid,uuid),
    public.dlrp_renew_insurance(uuid,uuid,integer)
to anon, authenticated;