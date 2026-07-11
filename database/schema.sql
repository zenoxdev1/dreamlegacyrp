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

    select * into v_sender from public.profiles where id = v_sender.id;
    return public._dlrp_profile_json(v_sender);
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
    public.dlrp_admin_resolve_report(uuid,uuid,text)
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