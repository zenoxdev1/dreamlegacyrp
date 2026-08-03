-- ============================================================
-- MIGRACIÓN: "Request Changes" -- que el admin pueda pedirle a
-- alguien que edite y vuelva a mandar su solicitud, con una nota
-- explicando qué hay que cambiar (no solo "Reset to Pending").
-- Todo aditivo, no toca ninguna funcion existente.
-- ============================================================

alter table public.profiles add column if not exists review_note text;

create or replace function public.dlrp_admin_request_changes(p_token uuid, p_profile_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
begin
    v_admin := public._dlrp_require_admin(p_token);
    if p_note is null or length(trim(p_note)) = 0 then raise exception 'Explain what needs to change.'; end if;

    update public.profiles set
        status = 'pending',
        review_note = p_note
    where id = p_profile_id;

    return jsonb_build_object('ok', true);
end;
$$;

-- Consulta aparte de dlrp_get_profile (para no tocar esa funcion,
-- que ya devuelve muchos otros campos y no quiero arriesgarme a
-- romperla sin verla). El jugador la consulta al cargar su perfil.
create or replace function public.dlrp_get_review_note(p_token uuid)
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

    return jsonb_build_object('reviewNote', v_profile.review_note);
end;
$$;

-- Cuando alguien reenvia su solicitud (submit del formulario),
-- borra la nota para que no se quede pegada para siempre.
create or replace function public.dlrp_clear_review_note(p_token uuid)
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

    update public.profiles set review_note = null where id = v_profile.id;
    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function
    public.dlrp_admin_request_changes(uuid,uuid,text),
    public.dlrp_get_review_note(uuid),
    public.dlrp_clear_review_note(uuid)
to anon, authenticated;