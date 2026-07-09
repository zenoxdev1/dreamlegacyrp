-- ============================================================
-- Dream Legacy RP — Esquema de base de datos (Supabase / Postgres)
-- ============================================================
-- Por qué Supabase:
--   - Gratis (plan Free: 500MB de base de datos, API REST/RPC
--     autogenerada, 50.000 usuarios activos/mes) y estable
--     (Postgres gestionado, backups diarios).
--   - No requiere mantener un servidor Node/Express aparte:
--     el frontend estático (Cloudflare Pages) llama directamente
--     a Supabase con la clave "anon" pública.
--   - Ya usas Supabase en otros proyectos (iChecke, TamilPath,
--     Kiosk City), así que reutilizas la misma cuenta/flujo.
--
-- Seguridad:
--   Las contraseñas NUNCA se leen desde el cliente. La tabla
--   `profiles` tiene RLS activado SIN políticas para anon/authenticated,
--   así que solo es accesible a través de las funciones RPC de abajo,
--   que corren como SECURITY DEFINER (con permisos de owner) y
--   validan usuario/contraseña o token de sesión internamente.
--
-- Cómo aplicar: pega este archivo completo en
--   Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- TABLAS ----------

create table if not exists public.profiles (
    id            uuid primary key default gen_random_uuid(),
    rp_name       text not null unique,
    password_hash text not null,
    discord_user  text not null default '',
    psn           text not null default '',
    story         text not null default '',
    extra_info    text not null default '',
    status        text not null default 'pending' check (status in ('pending','approved','denied')),
    job           text,
    bank          integer not null default 0,
    cash          integer not null default 0,
    theme         text not null default 'michael' check (theme in ('michael','trevor','franklin')),
    music_favorites jsonb not null default '[]'::jsonb,
    -- Campos usados por el Panel / Phone system (subdominio panel.*)
    phone_owned   boolean not null default false,
    phone_number  text,
    -- Datos flexibles del teléfono (contactos, vehículos, propiedades,
    -- negocios, inventario, foto de perfil, bio, ajustes...). Se guarda
    -- como jsonb en vez de crear una tabla por cada app del teléfono,
    -- ya que la mayoría de esas apps (bank.html, dialer.html, etc.)
    -- todavía están vacías/por construir en el proyecto original.
    phone_data    jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now()
);

create table if not exists public.sessions (
    token       uuid primary key default gen_random_uuid(),
    profile_id  uuid not null references public.profiles(id) on delete cascade,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null default (now() + interval '30 days')
);

create index if not exists idx_sessions_profile_id on public.sessions(profile_id);
create index if not exists idx_profiles_job on public.profiles(job);

-- ---------- ROW LEVEL SECURITY ----------
-- Se activa RLS y NO se crea ninguna policy para anon/authenticated,
-- así que nadie puede leer/escribir estas tablas directamente.
-- Todo el acceso pasa por las funciones RPC (SECURITY DEFINER) de abajo.

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;

-- ---------- FUNCIONES AUXILIARES ----------

create or replace function public._dlrp_profile_json(p public.profiles)
returns jsonb
language sql
stable
as $$
    select jsonb_build_object(
        'rpName', p.rp_name,
        'discordUser', p.discord_user,
        'psn', p.psn,
        'story', p.story,
        'extraInfo', p.extra_info,
        'status', p.status,
        'job', p.job,
        'bank', p.bank,
        'cash', p.cash,
        'theme', p.theme,
        'musicFavorites', p.music_favorites,
        'phoneOwned', p.phone_owned,
        'phoneNumber', p.phone_number,
        'phoneData', p.phone_data
    );
$$;

create or replace function public._dlrp_profile_from_token(p_token uuid)
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
    select pr.*
    from public.sessions s
    join public.profiles pr on pr.id = s.profile_id
    where s.token = p_token and s.expires_at > now()
    limit 1;
$$;

-- ---------- RPC: SALUD ----------

create or replace function public.dlrp_health()
returns boolean
language sql
stable
as $$ select true; $$;

-- ---------- RPC: WHITELIST (registro) ----------

create or replace function public.dlrp_whitelist_signup(
    p_rp_name text, p_discord_user text, p_psn text,
    p_password text, p_story text, p_extra_info text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    if p_rp_name is null or length(trim(p_rp_name)) = 0 then
        raise exception 'RP Name is required.';
    end if;
    if p_password is null or length(p_password) < 4 then
        raise exception 'Password must be at least 4 characters.';
    end if;
    if exists (select 1 from public.profiles where rp_name = p_rp_name) then
        raise exception 'That RP Name is already whitelisted.';
    end if;

    insert into public.profiles (rp_name, discord_user, psn, password_hash, story, extra_info)
    values (p_rp_name, p_discord_user, p_psn, crypt(p_password, gen_salt('bf')), p_story, coalesce(p_extra_info, ''))
    returning id into v_id;

    return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------- RPC: LOGIN / LOGOUT ----------

create or replace function public.dlrp_login(p_rp_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_token uuid;
begin
    select * into v_profile from public.profiles where rp_name = p_rp_name;

    if v_profile.id is null or v_profile.password_hash <> crypt(p_password, v_profile.password_hash) then
        raise exception 'Invalid RP Name or password.';
    end if;

    insert into public.sessions (profile_id) values (v_profile.id) returning token into v_token;

    return jsonb_build_object('token', v_token, 'profile', public._dlrp_profile_json(v_profile));
end;
$$;

create or replace function public.dlrp_logout(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
    delete from public.sessions where token = p_token;
$$;

-- ---------- RPC: PERFIL ----------

create or replace function public.dlrp_get_profile(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then
        raise exception 'Session expired.';
    end if;
    return public._dlrp_profile_json(v_profile);
end;
$$;

create or replace function public.dlrp_update_profile(p_token uuid, p_psn text, p_story text, p_extra_info text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then
        raise exception 'Session expired.';
    end if;

    update public.profiles set
        psn = coalesce(nullif(trim(p_psn), ''), psn),
        story = coalesce(nullif(trim(p_story), ''), story),
        extra_info = coalesce(p_extra_info, extra_info)
    where id = v_profile.id
    returning * into v_profile;

    return jsonb_build_object('profile', public._dlrp_profile_json(v_profile));
end;
$$;

create or replace function public.dlrp_set_theme(p_token uuid, p_theme text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if p_theme not in ('michael','trevor','franklin') then p_theme := 'michael'; end if;
    update public.profiles set theme = p_theme where id = v_profile.id;
end;
$$;

-- ---------- RPC: FAVORITOS DE MÚSICA ----------

create or replace function public.dlrp_add_favorite(p_token uuid, p_url text, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_favs jsonb;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    v_favs := v_profile.music_favorites || jsonb_build_array(jsonb_build_object('url', p_url, 'title', p_title));
    update public.profiles set music_favorites = v_favs where id = v_profile.id;
    return v_favs;
end;
$$;

create or replace function public.dlrp_remove_favorite(p_token uuid, p_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_favs jsonb;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    select jsonb_agg(elem) into v_favs
    from jsonb_array_elements(v_profile.music_favorites) elem
    where elem->>'url' <> p_url;

    v_favs := coalesce(v_favs, '[]'::jsonb);
    update public.profiles set music_favorites = v_favs where id = v_profile.id;
    return v_favs;
end;
$$;

-- ---------- RPC: TRABAJOS ----------
-- (El catálogo de trabajos vive en el frontend, en jobsList/starterJobsList;
--  aquí solo se guarda quién tiene cada trabajo.)

create or replace function public.dlrp_get_job_people(p_job_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'people', coalesce(jsonb_agg(rp_name), '[]'::jsonb)
    )
    from public.profiles
    where job = p_job_id;
$$;

create or replace function public.dlrp_apply_job(p_rp_name text, p_job_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from public.profiles where rp_name = p_rp_name) then
        raise exception 'That RP Name is not whitelisted yet.';
    end if;
    update public.profiles set job = p_job_id where rp_name = p_rp_name;
    return jsonb_build_object('ok', true);
end;
$$;

-- ---------- RPC: PANEL / TELÉFONO ----------
-- El Panel (panel.dreamlegacyrp.xyz) reutiliza el MISMO login que la
-- landing (dlrp_login) y el MISMO perfil (profiles), en vez del sistema
-- de "Create Account" separado que había antes en Phonesite/Panel
-- (ese sistema dejaba que cualquiera se creara una cuenta sin pasar
-- por la whitelist, lo cual contradice el propósito del formulario).
-- Si de verdad quieres permitir auto-registro sin whitelist en el
-- Panel, dímelo y añadimos un dlrp_panel_signup aparte.

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
    if v_profile.bank + v_profile.cash < p_price then raise exception 'Not enough money.'; end if;

    v_number := '555-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');

    update public.profiles set
        phone_owned = true,
        phone_number = coalesce(phone_number, v_number),
        bank = greatest(bank - p_price, 0)
    where id = v_profile.id
    returning * into v_profile;

    return public._dlrp_profile_json(v_profile);
end;
$$;

create or replace function public.dlrp_save_phone_data(p_token uuid, p_data jsonb)
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

    update public.profiles set phone_data = coalesce(v_profile.phone_data, '{}'::jsonb) || p_data
    where id = v_profile.id
    returning * into v_profile;

    return public._dlrp_profile_json(v_profile);
end;
$$;


-- Sincronización completa usada por DreamOS (os.html): guarda de una vez
-- banco, efectivo, teléfono y todos los demás datos flexibles
-- (contactos, vehículos, ajustes...) para minimizar llamadas a la red.
create or replace function public.dlrp_sync_phone_profile(
    p_token uuid, p_bank integer, p_cash integer,
    p_phone_owned boolean, p_phone_number text, p_phone_data jsonb
)
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

    update public.profiles set
        bank = greatest(coalesce(p_bank, bank), 0),
        cash = greatest(coalesce(p_cash, cash), 0),
        phone_owned = coalesce(p_phone_owned, phone_owned),
        phone_number = coalesce(p_phone_number, phone_number),
        phone_data = coalesce(p_phone_data, phone_data)
    where id = v_profile.id
    returning * into v_profile;

    return public._dlrp_profile_json(v_profile);
end;
$$;

-- Transferencia banco-a-banco entre jugadores (usada por bank.html).
-- Es atomica: ambas cuentas se actualizan en la misma transaccion,
-- y se valida todo en el servidor (no en el cliente).
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

    select * into v_sender from public.profiles where id = v_sender.id;
    return public._dlrp_profile_json(v_sender);
end;
$$;

-- Se concede EXECUTE a "anon" (visitantes sin sesión de Supabase Auth,
-- que es el caso de este sitio ya que usa su propio sistema de login).

grant execute on function
    public.dlrp_health(),
    public.dlrp_whitelist_signup(text,text,text,text,text,text),
    public.dlrp_login(text,text),
    public.dlrp_logout(uuid),
    public.dlrp_get_profile(uuid),
    public.dlrp_update_profile(uuid,text,text,text),
    public.dlrp_set_theme(uuid,text),
    public.dlrp_add_favorite(uuid,text,text),
    public.dlrp_remove_favorite(uuid,text),
    public.dlrp_get_job_people(text),
    public.dlrp_apply_job(text,text),
    public.dlrp_buy_phone(uuid,text,integer),
    public.dlrp_save_phone_data(uuid,jsonb),
    public.dlrp_sync_phone_profile(uuid,integer,integer,boolean,text,jsonb),
    public.dlrp_transfer_bank(uuid,text,integer)
to anon, authenticated;

-- Bloquear cualquier acceso directo por API REST autogenerada a las tablas:
revoke all on public.profiles from anon, authenticated;
revoke all on public.sessions from anon, authenticated;

-- ============================================================
-- Limpieza periódica de sesiones caducadas (opcional).
-- Puedes programar esto con pg_cron (disponible en Supabase) o
-- simplemente dejar que expires_at se valide en cada consulta.
-- select cron.schedule('dlrp-clean-sessions', '0 4 * * *',
--   $$ delete from public.sessions where expires_at < now(); $$);
-- ============================================================
