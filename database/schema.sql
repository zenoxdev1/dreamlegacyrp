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
    rp_name       text unique,
    password_hash text,
    -- Identidad de Discord (nuevo método de login). rp_name/password_hash
    -- se dejan nullable porque las cuentas creadas via Discord no los usan;
    -- se conservan por compatibilidad con cuentas antiguas de whitelist.
    discord_id       text unique,
    discord_username text,
    discord_avatar   text,
    discord_in_guild boolean not null default false,
    discord_user  text not null default '',
    psn           text not null default '',
    story         text not null default '',
    extra_info    text not null default '',
    status        text not null default 'pending' check (status in ('pending','approved','denied')),
    applied_at    timestamptz,
    -- Quien decidio (aprobo/rechazo) esta solicitud, y por que si fue
    -- rechazada. Se rellena solo desde dlrp_admin_set_status.
    decided_by_discord_id   text,
    decided_by_username     text,
    decided_at              timestamptz,
    deny_reason             text,
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
    -- Administradores del panel web (Aprobar/Rechazar solicitudes).
    -- Se activa a mano desde Table Editor: marca is_admin = true en
    -- la fila de la persona correspondiente.
    is_admin      boolean not null default false,
    -- Baneos: separado de "denied" porque denied es para solicitudes
    -- que nunca llegaron a entrar; is_banned es para gente ya aprobada
    -- a la que se le retira el acceso.
    is_banned     boolean not null default false,
    ban_reason    text,
    banned_by_username text,
    banned_at     timestamptz,
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

-- Reportes que un jugador manda sobre otro (bug, comportamiento, etc.)
create table if not exists public.reports (
    id                uuid primary key default gen_random_uuid(),
    reporter_id       uuid references public.profiles(id) on delete set null,
    reporter_name     text not null,
    reported_name     text,
    category          text not null default 'other' check (category in ('player','bug','other')),
    message           text not null,
    status            text not null default 'open' check (status in ('open','resolved','dismissed')),
    resolved_by_username text,
    resolved_at       timestamptz,
    created_at        timestamptz not null default now()
);

create index if not exists idx_reports_status on public.reports(status);

-- Mensajes reales entre jugadores (identificados por numero de telefono,
-- que es unico por jugador una vez compra su telefono).
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

-- Registro de llamadas (sin timbre en vivo por ahora -- se guarda
-- quien llamo a quien y cuando, para el historial de "Recientes").
create table if not exists public.call_logs (
    id            uuid primary key default gen_random_uuid(),
    from_number   text not null,
    to_number     text not null,
    from_rp_name  text,
    status        text not null default 'ringing' check (status in ('ringing','answered','declined','missed')),
    answered_at   timestamptz,
    created_at    timestamptz not null default now()
);

create index if not exists idx_calls_to on public.call_logs(to_number, created_at desc);
create index if not exists idx_calls_from on public.call_logs(from_number, created_at desc);
alter table public.call_logs enable row level security;

-- Solicitudes de DNI/Government ID, pendientes de aprobar por un admin.
create table if not exists public.id_requests (
    id                uuid primary key default gen_random_uuid(),
    profile_id        uuid not null references public.profiles(id) on delete cascade,
    full_name         text not null,
    dob               text not null,
    pob               text,
    gender            text,
    status            text not null default 'pending' check (status in ('pending','approved','denied')),
    id_number         text,
    decided_by_username text,
    decided_at        timestamptz,
    created_at        timestamptz not null default now()
);

create index if not exists idx_id_requests_status on public.id_requests(status);
alter table public.id_requests enable row level security;

-- Solicitudes de empleo, pendientes de aprobar por un admin.
create table if not exists public.job_applications (
    id                uuid primary key default gen_random_uuid(),
    profile_id        uuid not null references public.profiles(id) on delete cascade,
    job_name          text not null,
    status            text not null default 'pending' check (status in ('pending','approved','denied')),
    decided_by_username text,
    decided_at        timestamptz,
    created_at        timestamptz not null default now()
);

create index if not exists idx_job_apps_status on public.job_applications(status);
alter table public.job_applications enable row level security;

-- Solicitudes de permisos (conducir, armas), pendientes de aprobar.
create table if not exists public.license_requests (
    id                uuid primary key default gen_random_uuid(),
    profile_id        uuid not null references public.profiles(id) on delete cascade,
    license_type      text not null check (license_type in ('A','B','C','D','E','weapons')),
    status            text not null default 'pending' check (status in ('pending','approved','denied')),
    decided_by_username text,
    decided_at        timestamptz,
    created_at        timestamptz not null default now()
);

create index if not exists idx_license_requests_status on public.license_requests(status);
alter table public.license_requests enable row level security;

-- Historial de transferencias bancarias entre jugadores.
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

-- Registro de alertas de emergencia (Police/EMS), para que HQ pueda
-- ver un feed en vivo -- antes solo se mandaban al webhook de Discord
-- y no quedaba rastro en ningun sitio.
create table if not exists public.emergency_alerts (
    id            uuid primary key default gen_random_uuid(),
    department    text not null check (department in ('police','ems')),
    caller_name   text,
    caller_phone  text,
    location      text,
    created_at    timestamptz not null default now()
);

create index if not exists idx_emergency_alerts_dept on public.emergency_alerts(department, created_at desc);
alter table public.emergency_alerts enable row level security;

-- Anuncios internos por departamento (LSPD, EMS, etc.)
create table if not exists public.hq_announcements (
    id            uuid primary key default gen_random_uuid(),
    department    text not null,
    title         text not null,
    body          text not null,
    posted_by_username text,
    created_at    timestamptz not null default now()
);

create index if not exists idx_hq_announcements_dept on public.hq_announcements(department, created_at desc);
alter table public.hq_announcements enable row level security;

-- Vehiculos desbloqueados de pago, por departamento/rango.
create table if not exists public.hq_vehicle_unlocks (
    id            uuid primary key default gen_random_uuid(),
    profile_id    uuid not null references public.profiles(id) on delete cascade,
    department    text not null,
    vehicle_id    text not null,
    unlocked_at   timestamptz not null default now(),
    unique(profile_id, department, vehicle_id)
);

alter table public.hq_vehicle_unlocks enable row level security;

-- ---------- ROW LEVEL SECURITY ----------
-- Se activa RLS y NO se crea ninguna policy para anon/authenticated,
-- así que nadie puede leer/escribir estas tablas directamente.
-- Todo el acceso pasa por las funciones RPC (SECURITY DEFINER) de abajo.

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.reports enable row level security;

-- ---------- FUNCIONES AUXILIARES ----------

create or replace function public._dlrp_profile_json(p public.profiles)
returns jsonb
language sql
stable
as $$
    select jsonb_build_object(
        'rpName', p.rp_name,
        'discordId', p.discord_id,
        'discordUsername', p.discord_username,
        'discordAvatar', p.discord_avatar,
        'discordInGuild', p.discord_in_guild,
        'discordUser', p.discord_user,
        'psn', p.psn,
        'story', p.story,
        'extraInfo', p.extra_info,
        'status', p.status,
        'appliedAt', p.applied_at,
        'denyReason', p.deny_reason,
        'isBanned', p.is_banned,
        'banReason', p.ban_reason,
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

-- ---------- RPC: PANEL DE ADMINISTRACIÓN ----------
-- Solo perfiles con is_admin = true (activado a mano en Table Editor)
-- pueden usar estas funciones. Todas validan el token de sesión Y el
-- flag de administrador antes de devolver o modificar nada.

create or replace function public._dlrp_require_admin(p_token uuid)
returns public.profiles
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
    if not v_profile.is_admin then
        raise exception 'Not authorized.';
    end if;
    return v_profile;
end;
$$;

-- Se borran explícitamente por si se re-ejecuta este script sobre una
-- base de datos que ya tenía una versión anterior con distinta firma
-- ("create or replace" no sustituye una función si cambian los
-- parámetros -- crea una función nueva al lado, causando ambigüedad).
drop function if exists public.dlrp_admin_set_status(uuid, uuid, text);

create or replace function public.dlrp_admin_is(p_token uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then
        return false;
    end if;
    return coalesce(v_profile.is_admin, false);
end;
$$;

create or replace function public.dlrp_admin_stats(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select jsonb_build_object(
            'pending', count(*) filter (where status = 'pending'),
            'approved', count(*) filter (where status = 'approved'),
            'denied', count(*) filter (where status = 'denied'),
            'total', count(*),
            'inGuild', count(*) filter (where discord_in_guild)
        )
        from public.profiles
        where discord_id is not null
    );
end;
$$;

create or replace function public.dlrp_admin_list_applications(p_token uuid, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."appliedAt" desc nulls last), '[]'::jsonb)
        from (
            select
                id,
                rp_name as "rpName",
                discord_id as "discordId",
                discord_username as "discordUsername",
                discord_avatar as "discordAvatar",
                discord_in_guild as "discordInGuild",
                psn,
                story,
                extra_info as "extraInfo",
                status,
                applied_at as "appliedAt",
                decided_by_username as "decidedByUsername",
                decided_at as "decidedAt",
                deny_reason as "denyReason",
                bank,
                cash
            from public.profiles
            where discord_id is not null
              and (p_status is null or status = p_status)
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_set_status(p_token uuid, p_profile_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
begin
    v_admin := public._dlrp_require_admin(p_token);

    if p_status not in ('pending', 'approved', 'denied') then
        raise exception 'Invalid status.';
    end if;

    update public.profiles set
        status = p_status,
        decided_by_discord_id = v_admin.discord_id,
        decided_by_username = v_admin.discord_username,
        decided_at = now(),
        deny_reason = case when p_status = 'denied' then p_reason else null end
    where id = p_profile_id;

    if not found then
        raise exception 'Application not found.';
    end if;

    -- El envío del DM (aprobado/rechazado) lo dispara automáticamente
    -- el Database Webhook configurado sobre esta tabla, al detectar
    -- el cambio de status -- no hace falta duplicarlo aquí.
    return jsonb_build_object('ok', true, 'decidedBy', v_admin.discord_username);
end;
$$;

-- ---------- RPC: JUGADORES (vista completa para admins) ----------

create or replace function public.dlrp_admin_list_players(p_token uuid, p_search text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."rpName" nulls last), '[]'::jsonb)
        from (
            select
                id,
                rp_name as "rpName",
                discord_username as "discordUsername",
                discord_avatar as "discordAvatar",
                bank, cash,
                phone_number as "phoneNumber",
                phone_owned as "phoneOwned",
                job,
                is_banned as "isBanned",
                ban_reason as "banReason"
            from public.profiles
            where status = 'approved'
              and (
                p_search is null or p_search = '' or
                rp_name ilike '%' || p_search || '%' or
                discord_username ilike '%' || p_search || '%'
              )
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_get_player(p_token uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_target public.profiles;
begin
    perform public._dlrp_require_admin(p_token);

    select * into v_target from public.profiles where id = p_profile_id;
    if v_target.id is null then
        raise exception 'Player not found.';
    end if;

    return public._dlrp_profile_json(v_target);
end;
$$;

create or replace function public.dlrp_admin_set_ban(p_token uuid, p_profile_id uuid, p_banned boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
begin
    v_admin := public._dlrp_require_admin(p_token);

    update public.profiles set
        is_banned = p_banned,
        ban_reason = case when p_banned then p_reason else null end,
        banned_by_username = case when p_banned then v_admin.discord_username else null end,
        banned_at = case when p_banned then now() else null end
    where id = p_profile_id;

    if not found then
        raise exception 'Player not found.';
    end if;

    -- Invalida sus sesiones activas si se le banea, para que pierda
    -- el acceso ya mismo en vez de esperar a que caduque el token.
    if p_banned then
        delete from public.sessions where profile_id = p_profile_id;
    end if;

    return jsonb_build_object('ok', true);
end;
$$;

-- ---------- RPC: REPORTES ----------

create or replace function public.dlrp_submit_report(p_token uuid, p_reported_name text, p_category text, p_message text)
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
    if p_message is null or length(trim(p_message)) = 0 then raise exception 'Message is required.'; end if;
    if p_category not in ('player','bug','other') then p_category := 'other'; end if;

    insert into public.reports (reporter_id, reporter_name, reported_name, category, message)
    values (v_profile.id, coalesce(v_profile.rp_name, v_profile.discord_username), nullif(trim(coalesce(p_reported_name,'')), ''), p_category, p_message);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_admin_list_reports(p_token uuid, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" desc), '[]'::jsonb)
        from (
            select
                id, reporter_name as "reporterName", reported_name as "reportedName",
                category, message, status,
                resolved_by_username as "resolvedByUsername", resolved_at as "resolvedAt",
                created_at as "createdAt"
            from public.reports
            where p_status is null or status = p_status
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_resolve_report(p_token uuid, p_report_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
begin
    v_admin := public._dlrp_require_admin(p_token);
    if p_status not in ('open','resolved','dismissed') then raise exception 'Invalid status.'; end if;

    update public.reports set
        status = p_status,
        resolved_by_username = case when p_status <> 'open' then v_admin.discord_username else null end,
        resolved_at = case when p_status <> 'open' then now() else null end
    where id = p_report_id;

    if not found then raise exception 'Report not found.'; end if;
    return jsonb_build_object('ok', true);
end;
$$;

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
    if not exists (select 1 from public.profiles where phone_number = p_to_number) then
        raise exception 'That phone number doesn''t exist.';
    end if;

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

-- ---------- RPC: DNI / GOVERNMENT ID ----------

create or replace function public.dlrp_submit_id_request(p_token uuid, p_full_name text, p_dob text, p_pob text, p_gender text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_dob_date date;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if p_full_name is null or length(trim(p_full_name)) = 0 then raise exception 'Full name is required.'; end if;
    if position(' ' in trim(p_full_name)) = 0 then raise exception 'Enter your full name (first and last name).'; end if;
    if p_dob is null or length(trim(p_dob)) = 0 then raise exception 'Date of birth is required.'; end if;

    begin
        v_dob_date := to_date(p_dob, 'DD/MM/YYYY');
    exception when others then
        raise exception 'That is not a valid date.';
    end;
    if v_dob_date > current_date then raise exception 'Date of birth cannot be in the future.'; end if;
    if v_dob_date < current_date - interval '100 years' then raise exception 'That date of birth looks too far in the past.'; end if;
    if v_dob_date > current_date - interval '16 years' then raise exception 'Your character must be at least 16 years old.'; end if;

    if exists (select 1 from public.id_requests where profile_id = v_profile.id and status = 'pending') then
        raise exception 'You already have a pending ID request.';
    end if;

    insert into public.id_requests (profile_id, full_name, dob, pob, gender)
    values (v_profile.id, p_full_name, p_dob, p_pob, p_gender);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_get_id_status(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_request public.id_requests;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    select * into v_request from public.id_requests
    where profile_id = v_profile.id
    order by created_at desc
    limit 1;

    if v_request.id is null then
        return jsonb_build_object('status', 'none');
    end if;

    return jsonb_build_object(
        'status', v_request.status,
        'fullName', v_request.full_name,
        'dob', v_request.dob,
        'pob', v_request.pob,
        'gender', v_request.gender,
        'idNumber', v_request.id_number
    );
end;
$$;

create or replace function public.dlrp_admin_list_id_requests(p_token uuid, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" desc), '[]'::jsonb)
        from (
            select
                r.id, r.full_name as "fullName", r.dob, r.pob, r.gender, r.status,
                r.created_at as "createdAt", r.decided_by_username as "decidedByUsername",
                p.rp_name as "rpName", p.discord_username as "discordUsername", p.discord_avatar as "discordAvatar",
                p.psn
            from public.id_requests r
            join public.profiles p on p.id = r.profile_id
            where p_status is null or r.status = p_status
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_decide_id_request(p_token uuid, p_request_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
    v_request public.id_requests;
    v_id_number text;
begin
    v_admin := public._dlrp_require_admin(p_token);
    if p_status not in ('approved', 'denied') then raise exception 'Invalid status.'; end if;

    select * into v_request from public.id_requests where id = p_request_id;
    if v_request.id is null then raise exception 'Request not found.'; end if;

    v_id_number := case when p_status = 'approved' then 'SA-' || lpad(floor(random() * 999999)::int::text, 6, '0') else null end;

    update public.id_requests set
        status = p_status,
        id_number = v_id_number,
        decided_by_username = v_admin.discord_username,
        decided_at = now()
    where id = p_request_id;

    if p_status = 'approved' then
        update public.profiles set
            phone_data = coalesce(phone_data, '{}'::jsonb) || jsonb_build_object(
                'idInfo', jsonb_build_object(
                    'name', v_request.full_name,
                    'dob', v_request.dob,
                    'pob', v_request.pob,
                    'gender', v_request.gender,
                    'idNum', v_id_number,
                    'issued', to_char(now(), 'DD/MM/YYYY'),
                    'expires', to_char(now() + interval '4 years', 'DD/MM/YYYY')
                )
            )
        where id = v_request.profile_id;
    end if;

    return jsonb_build_object('ok', true, 'idNumber', v_id_number);
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

-- ---------- RPC: SOLICITUDES DE EMPLEO ----------

create or replace function public.dlrp_apply_job_v2(p_token uuid, p_job_name text)
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
    if v_profile.job is not null and v_profile.job <> '' then raise exception 'You already have a job. Quit it first.'; end if;
    if exists (select 1 from public.job_applications where profile_id = v_profile.id and status = 'pending') then
        raise exception 'You already have a pending job application.';
    end if;

    insert into public.job_applications (profile_id, job_name)
    values (v_profile.id, p_job_name);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_get_job_application_status(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_app public.job_applications;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    select * into v_app from public.job_applications
    where profile_id = v_profile.id
    order by created_at desc
    limit 1;

    if v_app.id is null then
        return jsonb_build_object('status', 'none');
    end if;

    return jsonb_build_object('status', v_app.status, 'jobName', v_app.job_name);
end;
$$;

create or replace function public.dlrp_quit_job(p_token uuid)
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

    update public.profiles set job = null where id = v_profile.id;
    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_admin_list_job_applications(p_token uuid, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" desc), '[]'::jsonb)
        from (
            select
                a.id, a.job_name as "jobName", a.status,
                a.created_at as "createdAt", a.decided_by_username as "decidedByUsername",
                p.rp_name as "rpName", p.discord_username as "discordUsername", p.discord_avatar as "discordAvatar"
            from public.job_applications a
            join public.profiles p on p.id = a.profile_id
            where p_status is null or a.status = p_status
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_decide_job_application(p_token uuid, p_application_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
    v_app public.job_applications;
begin
    v_admin := public._dlrp_require_admin(p_token);
    if p_status not in ('approved', 'denied') then raise exception 'Invalid status.'; end if;

    select * into v_app from public.job_applications where id = p_application_id;
    if v_app.id is null then raise exception 'Application not found.'; end if;

    update public.job_applications set
        status = p_status,
        decided_by_username = v_admin.discord_username,
        decided_at = now()
    where id = p_application_id;

    if p_status = 'approved' then
        update public.profiles set job = v_app.job_name where id = v_app.profile_id;
    end if;

    return jsonb_build_object('ok', true);
end;
$$;

-- ---------- RPC: PERMISOS (conducir, armas) ----------

create or replace function public.dlrp_submit_license_request(p_token uuid, p_license_type text)
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
    if p_license_type not in ('A','B','C','D','E','weapons') then raise exception 'Invalid license type.'; end if;

    if exists (
        select 1 from public.license_requests
        where profile_id = v_profile.id and license_type = p_license_type and status = 'pending'
    ) then
        raise exception 'You already have a pending request for this license.';
    end if;

    insert into public.license_requests (profile_id, license_type)
    values (v_profile.id, p_license_type);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_get_my_licenses(p_token uuid)
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
        select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        from (
            select license_type as "licenseType", status, created_at as "createdAt"
            from public.license_requests
            where profile_id = v_profile.id
            order by created_at desc
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_list_license_requests(p_token uuid, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public._dlrp_require_admin(p_token);

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" desc), '[]'::jsonb)
        from (
            select
                r.id, r.license_type as "licenseType", r.status,
                r.created_at as "createdAt", r.decided_by_username as "decidedByUsername",
                p.rp_name as "rpName", p.discord_username as "discordUsername", p.discord_avatar as "discordAvatar"
            from public.license_requests r
            join public.profiles p on p.id = r.profile_id
            where p_status is null or r.status = p_status
        ) t
    );
end;
$$;

create or replace function public.dlrp_admin_decide_license_request(p_token uuid, p_request_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
    v_req public.license_requests;
begin
    v_admin := public._dlrp_require_admin(p_token);
    if p_status not in ('approved', 'denied') then raise exception 'Invalid status.'; end if;

    select * into v_req from public.license_requests where id = p_request_id;
    if v_req.id is null then raise exception 'Request not found.'; end if;

    update public.license_requests set
        status = p_status,
        decided_by_username = v_admin.discord_username,
        decided_at = now()
    where id = p_request_id;

    if p_status = 'approved' then
        update public.profiles set
            phone_data = jsonb_set(
                coalesce(phone_data, '{}'::jsonb),
                array['licenses'],
                coalesce(phone_data->'licenses', '[]'::jsonb) || jsonb_build_array(
                    jsonb_build_object(
                        'type', v_req.license_type,
                        'issued', to_char(now(), 'DD/MM/YYYY'),
                        'expires', to_char(now() + interval '2 years', 'DD/MM/YYYY')
                    )
                )
            )
        where id = v_req.profile_id;
    end if;

    return jsonb_build_object('ok', true);
end;
$$;

-- Ficha de un ciudadano para verificacion en un control (LSPD/EMS).
-- Cualquier miembro del departamento puede usarla, no solo el jefe --
-- es una herramienta de trabajo del dia a dia, no de gestion.
create or replace function public.dlrp_hq_lookup_citizen(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
    v_reports_count int;
    v_licenses jsonb;
begin
    select * into v_profile from public.profiles
    where status = 'approved'
      and (rp_name ilike '%' || p_query || '%' or psn ilike '%' || p_query || '%')
    order by rp_name
    limit 1;

    if v_profile.id is null then
        return jsonb_build_object('found', false);
    end if;

    select count(*) into v_reports_count from public.reports where reported_name ilike v_profile.rp_name;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'type', lic->>'type',
            'issued', lic->>'issued',
            'expires', lic->>'expires',
            'valid', (to_date(lic->>'expires', 'DD/MM/YYYY') >= current_date)
        )
    ), '[]'::jsonb) into v_licenses
    from jsonb_array_elements(coalesce(v_profile.phone_data->'licenses', '[]'::jsonb)) as lic;

    return jsonb_build_object(
        'found', true,
        'rpName', v_profile.rp_name,
        'psn', v_profile.psn,
        'isBanned', v_profile.is_banned,
        'banReason', v_profile.ban_reason,
        'reportsOnFile', v_reports_count,
        'idInfo', v_profile.phone_data->'idInfo',
        'licenses', v_licenses,
        'job', v_profile.job
    );
end;
$$;

-- Se concede EXECUTE a "anon" (visitantes sin sesión de Supabase Auth,
-- que es el caso de este sitio ya que usa su propio sistema de login).

create or replace function public.dlrp_admin_set_money(p_token uuid, p_profile_id uuid, p_bank integer, p_cash integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin public.profiles;
    v_target public.profiles;
begin
    v_admin := public._dlrp_require_admin(p_token);

    update public.profiles set
        bank = greatest(coalesce(p_bank, bank), 0),
        cash = greatest(coalesce(p_cash, cash), 0)
    where id = p_profile_id
    returning * into v_target;

    if not found then
        raise exception 'Player not found.';
    end if;

    return jsonb_build_object('ok', true, 'bank', v_target.bank, 'cash', v_target.cash);
end;
$$;

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
    public.dlrp_transfer_bank(uuid,text,integer),
    public.dlrp_get_bank_history(uuid),
    public.dlrp_admin_is(uuid),
    public.dlrp_admin_stats(uuid),
    public.dlrp_admin_list_applications(uuid,text),
    public.dlrp_admin_set_status(uuid,uuid,text,text),
    public.dlrp_admin_set_money(uuid,uuid,integer,integer),
    public.dlrp_admin_list_players(uuid,text),
    public.dlrp_admin_get_player(uuid,uuid),
    public.dlrp_admin_set_ban(uuid,uuid,boolean,text),
    public.dlrp_submit_report(uuid,text,text,text),
    public.dlrp_admin_list_reports(uuid,text),
    public.dlrp_admin_resolve_report(uuid,uuid,text),
    public.dlrp_send_message(uuid,text,text),
    public.dlrp_get_message_threads(uuid),
    public.dlrp_get_thread_messages(uuid,text),
    public.dlrp_place_call(uuid,text),
    public.dlrp_get_recent_calls(uuid),
    public.dlrp_check_incoming_call(uuid),
    public.dlrp_respond_call(uuid,uuid,boolean),
    public.dlrp_get_call_outcome(uuid,uuid),
    public.dlrp_submit_id_request(uuid,text,text,text,text),
    public.dlrp_get_id_status(uuid),
    public.dlrp_admin_list_id_requests(uuid,text),
    public.dlrp_admin_decide_id_request(uuid,uuid,text),
    public.dlrp_apply_job_v2(uuid,text),
    public.dlrp_get_job_application_status(uuid),
    public.dlrp_quit_job(uuid),
    public.dlrp_admin_list_job_applications(uuid,text),
    public.dlrp_admin_decide_job_application(uuid,uuid,text),
    public.dlrp_submit_license_request(uuid,text),
    public.dlrp_get_my_licenses(uuid),
    public.dlrp_admin_list_license_requests(uuid,text),
    public.dlrp_admin_decide_license_request(uuid,uuid,text)
to anon, authenticated;

-- Esta SOLO la puede llamar el backend (Cloudflare Function con la
-- Service Role Key), nunca el cliente directamente -- por eso no
-- esta en la lista de arriba con "anon, authenticated".
grant execute on function public.dlrp_hq_lookup_citizen(text) to service_role;

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