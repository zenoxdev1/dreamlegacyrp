-- ============================================================
-- FIX: al comprar un teléfono nunca se guardaba el nombre real
-- del modelo ni el precio pagado en phone_data -- por eso al
-- vender, no se encontraba el precio y se calculaba un reembolso
-- de $0. Esta migración corrige la función para futuras compras.
-- ============================================================

create or replace function public.dlrp_buy_phone(p_token uuid, p_model text, p_price integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_number text;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if v_profile.phone_owned then raise exception 'You already own a phone.'; end if;
    if v_profile.bank + v_profile.cash < p_price then raise exception 'Not enough money.'; end if;

    v_number := '555-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');

    update public.profiles set
        phone_owned = true,
        phone_number = coalesce(phone_number, v_number),
        bank = greatest(bank - p_price, 0),
        phone_data = coalesce(phone_data, '{}'::jsonb) || jsonb_build_object('purchasedPhone', p_model, 'purchasedPhonePrice', p_price)
    where id = v_profile.id
    returning * into v_profile;

    return public._dlrp_profile_json(v_profile);
end;
$$;

-- ============================================================
-- Compensación manual para quien ya se vio afectado por este bug
-- (vendió por $0 antes de este arreglo): ve a Table Editor ->
-- profiles, busca su fila, y súmale a mano en la columna `bank`
-- la mitad del precio del modelo que tenía. También puedes
-- hacerlo desde el panel de administración (pestaña Admin ->
-- busca su solicitud aprobada -> edita Bank/Cash ahí mismo).
-- ============================================================