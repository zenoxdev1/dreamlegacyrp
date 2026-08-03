-- ============================================================
-- MIGRACIÓN: idioma preferido del jugador (para que los DMs de
-- Discord lleguen en su idioma, no siempre en inglés).
-- Se rellena solo cuando cambian el idioma en la web.
-- ============================================================

alter table public.profiles add column if not exists preferred_language text default 'en';

create or replace function public.dlrp_set_preferred_language(p_token uuid, p_lang text)
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
    if p_lang not in ('en', 'fr', 'pt') then raise exception 'Unsupported language.'; end if;

    update public.profiles set preferred_language = p_lang where id = v_profile.id;
    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.dlrp_set_preferred_language(uuid,text) to anon, authenticated;